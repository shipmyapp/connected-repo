import { filesDb } from "../db/files.db";
import type { StoredFile } from "../db/schema.db.types";
import { OPFSManager } from "../utils/opfs.manager";
import { getMediaProxy } from "../worker.context";

/**
 * State-machine driver for the local → CDN upload pipeline.
 *
 * Each file row carries its own per-layer state (main + thumbnail). The
 * worker scans for files that need work on every trigger, honours the
 * concurrency limit (`MAX_CONCURRENT`), and drives each row through:
 *
 *   pending → uploading → uploaded_to_cdn → uploaded
 *
 * On CDN-upload success we mark the layer `uploaded_to_cdn` locally and
 * kick the sync orchestrator so `files.pushCdnUpdates` runs immediately
 * — that promotes `uploaded_to_cdn` → `uploaded`.
 *
 * Retries: max 5 attempts, backoff `[1, 2, 4, 8, 16]s`. Recovery on
 * boot re-picks any row stuck in `uploading` older than 5 minutes.
 */

const MAX_CONCURRENT = 3;
const MAX_ATTEMPTS = 5;
const BACKOFF_SECONDS = [1, 2, 4, 8, 16];
const STUCK_UPLOADING_CUTOFF_MS = 5 * 60 * 1_000;

/**
 * Public surface exported through the DataWorker's Comlink proxy.
 * Explicit interface so TypeScript can emit a proper declaration —
 * the class itself has private members (TS4094).
 */
export interface FileUploadWorkerApi {
	run(): Promise<void>;
}

class FileUploadWorker implements FileUploadWorkerApi {
	private inFlight = new Set<string>();
	private isProcessing = false;

	/**
	 * Called by the orchestrator (or directly by media pick flow after
	 * staging) to drain any pending files.
	 */
	async run(): Promise<void> {
		if (this.isProcessing) return;
		this.isProcessing = true;

		try {
			await this.recoverStuck();

			const pending = await filesDb.getPendingUploads();
			for (const row of pending) {
				if (this.inFlight.size >= MAX_CONCURRENT) break;
				if (this.inFlight.has(row.id)) continue;
				if (!this.isDueForRetry(row, "main") && !this.isDueForRetry(row, "thumbnail"))
					continue;

				this.inFlight.add(row.id);
				void this.processFile(row).finally(() => {
					this.inFlight.delete(row.id);
				});
			}
		} finally {
			this.isProcessing = false;
		}
	}

	private isDueForRetry(row: StoredFile, layer: "main" | "thumbnail"): boolean {
		const state = layer === "main" ? row.mainUploadState : row.thumbnailUploadState;
		if (state !== "pending" && state !== "failed") return false;

		const attempts = layer === "main" ? row.mainUploadAttempts : row.thumbnailUploadAttempts;
		if (attempts >= MAX_ATTEMPTS) return false;

		const lastAt = layer === "main" ? row.mainLastAttemptAt : row.thumbnailLastAttemptAt;
		if (!lastAt || attempts === 0) return true;

		const backoffIndex = Math.min(attempts - 1, BACKOFF_SECONDS.length - 1);
		const backoffMs = (BACKOFF_SECONDS[backoffIndex] ?? 16) * 1_000;
		return Date.now() - lastAt >= backoffMs;
	}

	private async recoverStuck(): Promise<void> {
		const pending = await filesDb.getPendingUploads();
		const cutoff = Date.now() - STUCK_UPLOADING_CUTOFF_MS;
		for (const row of pending) {
			if (
				row.mainUploadState === "uploading" &&
				(row.mainLastAttemptAt ?? 0) < cutoff
			) {
				await filesDb.updateUploadState(row.id, "main", {
					state: "failed",
					lastError: "recovered from stuck uploading state",
				});
			}
			if (
				row.thumbnailUploadState === "uploading" &&
				(row.thumbnailLastAttemptAt ?? 0) < cutoff
			) {
				await filesDb.updateUploadState(row.id, "thumbnail", {
					state: "failed",
					lastError: "recovered from stuck uploading state",
				});
			}
		}
	}

	private async processFile(row: StoredFile): Promise<void> {
		const mainTask =
			row.mainUploadState === "pending" || row.mainUploadState === "failed"
				? this.runMainUpload(row)
				: Promise.resolve();

		const thumbTask =
			row.thumbnailUploadState === "pending" || row.thumbnailUploadState === "failed"
				? this.runThumbnailUpload(row)
				: Promise.resolve();

		await Promise.all([mainTask, thumbTask]);
	}

	private async runMainUpload(row: StoredFile): Promise<void> {
		await filesDb.updateUploadState(row.id, "main", {
			state: "uploading",
			attempts: row.mainUploadAttempts + 1,
			lastAttemptAt: Date.now(),
		});

		try {
			const blob = row.mainOpfsPath ? await OPFSManager.readFile(row.mainOpfsPath) : null;
			if (!blob) {
				await filesDb.updateUploadState(row.id, "main", {
					state: "lost",
					lastError: "source blob missing",
					isMainFileLost: true,
				});
				return;
			}

			const file = new File([blob], row.fileName, { type: row.mimeType });
			const mediaProxy = await getMediaProxy();
			const results = await mediaProxy.cdn.uploadFiles([{ id: row.id, file }]);
			const result = results[0];
			if (!result?.success || !result.url) {
				throw new Error(result?.error ?? "CDN upload failed");
			}

			await filesDb.updateUploadState(row.id, "main", {
				state: "uploaded_to_cdn",
				cdnUrl: result.url,
				lastError: null,
			});
		} catch (err) {
			await filesDb.updateUploadState(row.id, "main", {
				state: row.mainUploadAttempts + 1 >= MAX_ATTEMPTS ? "abandoned" : "failed",
				lastError: err instanceof Error ? err.message : String(err),
			});
		}
	}

	private async runThumbnailUpload(row: StoredFile): Promise<void> {
		await filesDb.updateUploadState(row.id, "thumbnail", {
			state: "generating",
			attempts: row.thumbnailUploadAttempts + 1,
			lastAttemptAt: Date.now(),
		});

		try {
			// Read the main source blob (thumbnails derive from it).
			const sourceBlob = row.mainOpfsPath
				? await OPFSManager.readFile(row.mainOpfsPath)
				: null;
			if (!sourceBlob) {
				await filesDb.updateUploadState(row.id, "thumbnail", {
					state: "not_attempted",
					lastError: "no source blob for thumbnail",
				});
				return;
			}

			const mediaProxy = await getMediaProxy();
			const sourceFile = new File([sourceBlob], row.fileName, { type: row.mimeType });
			const thumb = await mediaProxy.media.generateThumbnail(sourceFile);
			if (!thumb.thumbnailFile) {
				await filesDb.updateUploadState(row.id, "thumbnail", {
					state: "not_attempted",
					lastError: thumb.error ?? "no thumbnail generated",
				});
				return;
			}

			await filesDb.updateUploadState(row.id, "thumbnail", { state: "uploading" });

			const results = await mediaProxy.cdn.uploadFiles([
				{ id: `${row.id}-thumb`, file: thumb.thumbnailFile },
			]);
			const result = results[0];
			if (!result?.success || !result.url) {
				throw new Error(result?.error ?? "thumbnail CDN upload failed");
			}

			await filesDb.updateUploadState(row.id, "thumbnail", {
				state: "uploaded_to_cdn",
				thumbnailCdnUrl: result.url,
				lastError: null,
			});
		} catch (err) {
			await filesDb.updateUploadState(row.id, "thumbnail", {
				state:
					row.thumbnailUploadAttempts + 1 >= MAX_ATTEMPTS ? "abandoned" : "failed",
				lastError: err instanceof Error ? err.message : String(err),
			});
		}
	}
}

export const fileUploadWorker: FileUploadWorkerApi = new FileUploadWorker();
