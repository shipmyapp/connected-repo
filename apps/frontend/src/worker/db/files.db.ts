import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import { OPFSManager } from "../utils/opfs.manager";
import { getClientDb } from "./db.lifecycle";
import { notifySubscribers } from "./db.manager";
import type { FileUploadState, StoredFile } from "./schema.db.types";

/**
 * Compact input for the media-pick flow: everything the caller knows at
 * pick time. Server-owned fields (`createdByUserId`, `teamId`,
 * `createdAt`, `updatedAt`) are filled with client-side placeholders and
 * overwritten by the server-authoritative echo (via
 * `bulkUpsertFromServer` / `mergeFilesFromServer`) once the parent's
 * `create` / `pushCreates` round-trip lands.
 */
export interface UpsertLocalFileInput {
	id: string;
	tableName: FileSelectAll["tableName"];
	tableId: string;
	fileName: string;
	mimeType: string;
	blob: Blob;
	teamId?: string | null;
}

/**
 * File rows carry two pieces of state that pure metadata rows do not:
 *
 *   1. Per-layer upload state machine (main + thumbnail) — see
 *      `schema.db.types.ts` for the transitions.
 *   2. Local blob (OPFS-backed) for pending uploads.
 *
 * Blobs never live in Dexie/IndexedDB. On `upsertLocal` we compute the
 * SHA-256 checksum, write the blob to OPFS at a deterministic path, and
 * store only the path + checksum in Dexie. This keeps IDB rows small
 * (browsers throttle at multi-MB rows) and enables the CDN-first
 * recovery path (`checkFileExistsInCdn`).
 */
export const filesDb = {
	async getById(id: string): Promise<StoredFile | undefined> {
		return await getClientDb().files.get(id);
	},

	async getAllForParent(tableName: string, tableId: string): Promise<StoredFile[]> {
		return await getClientDb().files.where({ tableName, tableId }).toArray();
	},

	/**
	 * Fetch every file in a team scoped to a single parent table (e.g.
	 * all files under `journalEntries` for the active team). Replaces the
	 * N+1 pattern where a list page fired one `files.getByTableId` per
	 * visible row — those rows are already mirrored locally by the sync
	 * pull pipeline, so this is a single indexed Dexie query with no
	 * server round-trip.
	 */
	async getAllForTeamAndTable(
		teamId: string,
		tableName: FileSelectAll["tableName"],
	): Promise<StoredFile[]> {
		return await getClientDb()
			.files.where({ teamId, tableName })
			.toArray();
	},

	/**
	 * Local write for a freshly-picked file — the single entry point for
	 * BOTH online and offline flows. The blob is written to OPFS at a
	 * deterministic per-id path and only the OPFS path + checksum land in
	 * Dexie. The row starts in `mainUploadState: "pending"` so the
	 * `FileUploadWorker` picks it up on the next trigger.
	 *
	 * Server-owned fields (`createdByUserId`, `createdAt`, `updatedAt`)
	 * are stamped with placeholder values that the server-authoritative
	 * echo overwrites once the parent's create round-trip lands. The
	 * `thumbnail*` blob is NOT taken here — the worker generates it lazily
	 * from the main OPFS blob during upload (mirrors tezi).
	 */
	async upsertLocal(input: UpsertLocalFileInput): Promise<StoredFile> {
		const ext = input.blob.type.split("/").pop() ?? "bin";
		const mainOpfsPath = `files/${input.id}/original.${ext}`;
		const mainChecksum = await OPFSManager.calculateChecksum(input.blob);
		await OPFSManager.saveFile(mainOpfsPath, input.blob);

		const stored: StoredFile = {
			id: input.id,
			tableName: input.tableName,
			tableId: input.tableId,
			type: "attachment",
			fileName: input.fileName,
			mimeType: input.mimeType,
			// Placeholders — the server-authoritative echo overwrites these.
			// `createdByUserId` is a valid-looking sentinel so Dexie's schema
			// stays happy; the server never trusts it (auth context wins).
			createdByUserId: "00000000-0000-0000-0000-000000000000",
			teamId: input.teamId ?? null,
			cdnUrl: null,
			thumbnailCdnUrl: null,
			deletedAt: null,
			isMainFileLost: false,
			createdAt: 0,
			updatedAt: "0",
			// Client-only upload-state machine — starts pending, worker drives.
			mainUploadState: "pending",
			mainUploadAttempts: 0,
			mainLastError: null,
			mainLastAttemptAt: null,
			mainChecksum,
			mainOpfsPath,
			thumbnailUploadState: canGenerateThumbnail(input.mimeType)
				? "pending"
				: "not_attempted",
			thumbnailUploadAttempts: 0,
			thumbnailLastError: null,
			thumbnailLastAttemptAt: null,
			thumbnailChecksum: null,
			thumbnailOpfsPath: null,
			syncError: null,
		};

		await getClientDb().files.put(stored);
		notifySubscribers("files");
		return stored;
	},

	/** Server-authoritative overwrite (pull-delta or push-echo). */
	async bulkUpsertFromServer(rows: FileSelectAll[]): Promise<void> {
		if (rows.length === 0) return;
		await getClientDb().transaction("rw", getClientDb().files, async () => {
			for (const row of rows) {
				const existing = await getClientDb().files.get(row.id);
				// Preserve client-only fields when the server row overwrites.
				//
				// `cdnUrl` / `thumbnailCdnUrl` / `isMainFileLost` are client-
				// owned in the window between "uploaded to CDN" and
				// "server acknowledged via pushCdnUpdates". If a pull runs
				// during that window, the server row still has null/false
				// for these fields — but the local row already has the
				// authoritative post-PUT values queued for push. Falling
				// back to `existing` when the server value is empty keeps
				// the queued push intact; otherwise the next pushCdnUpdates
				// sees a null and sends nothing, permanently stranding the
				// upload.
				const mergedCdnUrl = row.cdnUrl ?? existing?.cdnUrl ?? null;
				const mergedThumbCdnUrl =
					row.thumbnailCdnUrl ?? existing?.thumbnailCdnUrl ?? null;

				// Server-heals-stuck-local. If the server row already has a
				// CDN URL, force the corresponding local state to `uploaded`
				// and clear any error. Without this, a per-device transient
				// failure (`failed` / `abandoned` / `lost`) stays sticky
				// forever even after the same file was uploaded on another
				// device and mirrored down.
				const serverHasMain = row.cdnUrl != null;
				const serverHasThumb = row.thumbnailCdnUrl != null;

				const merged: StoredFile = {
					...row,
					cdnUrl: mergedCdnUrl,
					thumbnailCdnUrl: mergedThumbCdnUrl,
					isMainFileLost:
						row.isMainFileLost || existing?.isMainFileLost || false,
					mainUploadState: serverHasMain
						? "uploaded"
						: existing?.mainUploadState ?? "pending",
					mainUploadAttempts: existing?.mainUploadAttempts ?? 0,
					mainLastError: serverHasMain ? null : existing?.mainLastError ?? null,
					mainLastAttemptAt: existing?.mainLastAttemptAt ?? null,
					// `mainChecksum` and `mainOpfsPath` are device-local — the
					// blob physically lives in this device's OPFS at that path.
					// For rows arriving from the server for the first time
					// (another device uploaded), `existing` is undefined and
					// both stay null. That's correct: there's no blob to point
					// at. Consequence: `FileUploadWorker.runMainUpload` cannot
					// retry the upload from THIS device — it needs the OPFS
					// blob. Which is fine, because the CDN URL is already set
					// (that's how we know the file exists at all). Recovery
					// from `isMainFileLost === true` on such a row requires
					// the user to re-pick the file.
					mainChecksum: existing?.mainChecksum ?? null,
					mainOpfsPath: existing?.mainOpfsPath ?? null,
					thumbnailUploadState: serverHasThumb
						? "uploaded"
						: existing?.thumbnailUploadState ??
							(canGenerateThumbnail(row.mimeType) ? "pending" : "not_attempted"),
					thumbnailUploadAttempts: existing?.thumbnailUploadAttempts ?? 0,
					thumbnailLastError: serverHasThumb
						? null
						: existing?.thumbnailLastError ?? null,
					thumbnailLastAttemptAt: existing?.thumbnailLastAttemptAt ?? null,
					thumbnailChecksum: existing?.thumbnailChecksum ?? null,
					thumbnailOpfsPath: existing?.thumbnailOpfsPath ?? null,
					syncError: existing?.syncError ?? null,
				};
				await getClientDb().files.put(merged);
			}
		});
		notifySubscribers("files", "sync");
	},

	async updateUploadState(
		id: string,
		layer: "main" | "thumbnail",
		patch: {
			state?: FileUploadState;
			attempts?: number;
			lastError?: string | null;
			lastAttemptAt?: number | null;
			checksum?: string | null;
			opfsPath?: string | null;
			cdnUrl?: string | null;
			thumbnailCdnUrl?: string | null;
			isMainFileLost?: boolean;
		},
	): Promise<void> {
		const cols: Record<string, unknown> = {};
		const prefix = layer;
		if (patch.state !== undefined) cols[`${prefix}UploadState`] = patch.state;
		if (patch.attempts !== undefined) cols[`${prefix}UploadAttempts`] = patch.attempts;
		if (patch.lastError !== undefined) cols[`${prefix}LastError`] = patch.lastError;
		if (patch.lastAttemptAt !== undefined) cols[`${prefix}LastAttemptAt`] = patch.lastAttemptAt;
		if (patch.checksum !== undefined) cols[`${prefix}Checksum`] = patch.checksum;
		if (patch.opfsPath !== undefined) cols[`${prefix}OpfsPath`] = patch.opfsPath;
		if (layer === "main" && patch.cdnUrl !== undefined) cols.cdnUrl = patch.cdnUrl;
		if (layer === "thumbnail" && patch.thumbnailCdnUrl !== undefined) {
			cols.thumbnailCdnUrl = patch.thumbnailCdnUrl;
		}
		if (patch.isMainFileLost !== undefined) cols.isMainFileLost = patch.isMainFileLost;

		await getClientDb().files.update(id, cols);
		// Transition to `uploaded_to_cdn` is the "ready-to-push CDN URL"
		// signal. Notify as `external` so the orchestrator's subscribe
		// callback fires `drainLocalChanges` → immediate pushCdnUpdates.
		// Every other state transition (uploading, failed, attempts++,
		// etc.) stays `sync` to avoid a self-trigger loop.
		const readyToPush = patch.state === "uploaded_to_cdn";
		notifySubscribers("files", readyToPush ? "external" : "sync");
	},

	async getPendingUploads(): Promise<StoredFile[]> {
		// Only rows staged locally to OPFS are candidates. Server-pulled
		// file rows for entries created on other devices land here with
		// `mainOpfsPath: null` (no source blob on this device) — the worker
		// would just churn read attempts and mark them "lost". Filtering
		// here avoids the noise without changing the upload/lost semantic
		// for genuine loss of a local blob (staged with a path that later
		// went missing — still gets picked up and correctly marked "lost").
		return await getClientDb()
			.files.where("mainUploadState")
			.anyOf(["pending", "uploading", "failed"])
			.filter((f) => Boolean(f.mainOpfsPath))
			.toArray();
	},

	async getCdnUpdatesNeedingPush(): Promise<StoredFile[]> {
		return await getClientDb().files
			.filter(
				(f) =>
					f.mainUploadState === "uploaded_to_cdn" ||
					f.thumbnailUploadState === "uploaded_to_cdn" ||
					f.isMainFileLost === true,
			)
			.toArray();
	},

	async markCdnPushed(id: string, layer: "main" | "thumbnail"): Promise<void> {
		const cols: Record<string, unknown> = {};
		if (layer === "main") cols.mainUploadState = "uploaded";
		if (layer === "thumbnail") cols.thumbnailUploadState = "uploaded";
		await getClientDb().files.update(id, cols);
		notifySubscribers("files", "sync");
	},

	async setSyncError(id: string, error: string | null): Promise<void> {
		await getClientDb().files.update(id, { syncError: error });
		notifySubscribers("files", "sync");
	},

	/** Count files still working through the upload state machine. */
	async countPending(teamId: string): Promise<number> {
		return await getClientDb()
			.files.where({ teamId })
			.filter(
				(f) =>
					f.mainUploadState === "pending" ||
					f.mainUploadState === "uploading" ||
					f.mainUploadState === "uploaded_to_cdn" ||
					f.thumbnailUploadState === "pending" ||
					f.thumbnailUploadState === "uploading" ||
					f.thumbnailUploadState === "uploaded_to_cdn" ||
					f.thumbnailUploadState === "generating",
			)
			.count();
	},

	/** Count files carrying a sync error or in a terminal-fail state. */
	async countErrors(teamId: string): Promise<number> {
		return await getClientDb()
			.files.where({ teamId })
			.filter(
				(f) =>
					Boolean(f.syncError) ||
					f.mainUploadState === "failed" ||
					f.mainUploadState === "abandoned" ||
					f.mainUploadState === "lost",
			)
			.count();
	},

	/**
	 * Full rows for the pending drill-in on the sync-status page. Same
	 * filter shape as `countPending` so the two agree row-for-row.
	 */
	async listPending(teamId: string): Promise<StoredFile[]> {
		return await getClientDb()
			.files.where({ teamId })
			.filter(
				(f) =>
					f.mainUploadState === "pending" ||
					f.mainUploadState === "uploading" ||
					f.mainUploadState === "uploaded_to_cdn" ||
					f.thumbnailUploadState === "pending" ||
					f.thumbnailUploadState === "uploading" ||
					f.thumbnailUploadState === "uploaded_to_cdn" ||
					f.thumbnailUploadState === "generating",
			)
			.toArray();
	},

	/** Full rows for the error drill-in on the sync-status page. */
	async listErrored(teamId: string): Promise<StoredFile[]> {
		return await getClientDb()
			.files.where({ teamId })
			.filter(
				(f) =>
					Boolean(f.syncError) ||
					f.mainUploadState === "failed" ||
					f.mainUploadState === "abandoned" ||
					f.mainUploadState === "lost",
			)
			.toArray();
	},

	/**
	 * Hard-delete a single file row + its OPFS blob. Used from the sync-
	 * status "Discard" action when a stuck row can't be recovered
	 * (`lost`, `abandoned`, or repeated `syncError`). Server-side rows
	 * are NOT touched here — the caller's responsibility to keep the
	 * server in sync via its own delete path.
	 */
	async hardDelete(id: string): Promise<void> {
		const row = await getClientDb().files.get(id);
		if (row?.mainOpfsPath) {
			try {
				await OPFSManager.deleteFile(row.mainOpfsPath);
			} catch {
				// OPFS delete failures aren't fatal — Dexie row is the ground truth.
			}
		}
		if (row?.thumbnailOpfsPath) {
			try {
				await OPFSManager.deleteFile(row.thumbnailOpfsPath);
			} catch {}
		}
		await getClientDb().files.delete(id);
		notifySubscribers("files");
	},

	/**
	 * User-driven "give up on this upload" for a file that's stuck in
	 * pending / uploading / failed. Sets `isMainFileLost: true` and
	 * transitions the local state to `lost`. `pushCdnUpdates` picks it
	 * up (see `filesDb.getCdnUpdatesNeedingPush` — it includes rows with
	 * `isMainFileLost === true`) and informs the server the blob will
	 * never arrive, so the row leaves "pending" without needing a CDN
	 * upload to succeed. The OPFS blob (if any) is deleted since the
	 * upload path is done with it.
	 *
	 * This is the escape hatch when a file can't be uploaded (fake S3
	 * keys, revoked credentials, corrupt blob) but the parent entry is
	 * already confirmed on the server — regular Discard is a no-op in
	 * that case because the next pull would re-add the row.
	 */
	async abandonUpload(id: string): Promise<void> {
		const row = await getClientDb().files.get(id);
		if (!row) return;
		if (row.mainOpfsPath) {
			try {
				await OPFSManager.deleteFile(row.mainOpfsPath);
			} catch {}
		}
		if (row.thumbnailOpfsPath) {
			try {
				await OPFSManager.deleteFile(row.thumbnailOpfsPath);
			} catch {}
		}
		await getClientDb().files.update(id, {
			isMainFileLost: true,
			mainUploadState: "lost",
			mainOpfsPath: null,
			thumbnailUploadState:
				row.thumbnailUploadState === "uploaded" ? "uploaded" : "not_attempted",
			thumbnailOpfsPath: null,
			syncError: null,
			mainLastError: "Abandoned by user",
		});
		notifySubscribers("files");
	},

	/**
	 * Reset a stuck file back to `pending` so the upload worker retries
	 * from scratch. Wipes error state and attempt counters. Only works
	 * for rows that still have an OPFS blob — a `lost` row has no source
	 * to retry from and must be discarded instead.
	 */
	async retry(id: string): Promise<void> {
		const row = await getClientDb().files.get(id);
		if (!row?.mainOpfsPath) return;
		await getClientDb().files.update(id, {
			mainUploadState: "pending",
			mainUploadAttempts: 0,
			mainLastError: null,
			mainLastAttemptAt: null,
			thumbnailUploadState:
				row.thumbnailUploadState === "uploaded" ||
				row.thumbnailUploadState === "uploaded_to_cdn"
					? row.thumbnailUploadState
					: row.mimeType.startsWith("image/") ||
							row.mimeType === "application/pdf"
						? "pending"
						: "not_attempted",
			thumbnailUploadAttempts: 0,
			thumbnailLastError: null,
			thumbnailLastAttemptAt: null,
			syncError: null,
		});
		notifySubscribers("files");
	},

	/**
	 * One-shot repair for the historical bug where a pull-during-upload
	 * clobbered the thumbnail URL after `markCdnPushed` had already
	 * promoted the state to `"uploaded"` — leaving the row permanently
	 * stranded with `thumbnailUploadState === "uploaded"` but
	 * `thumbnailCdnUrl === null` on both client and server.
	 *
	 * Called once per session from `SyncOrchestrator.initForUser` (after
	 * the DB opens, before the first pull). Resets those rows back to
	 * `pending` so the FileUploadWorker regenerates + re-uploads the
	 * thumbnail from the local OPFS blob on its next run. Only touches
	 * rows where the OPFS blob is still available (`mainOpfsPath` set) —
	 * without it the worker has nothing to derive a thumbnail from.
	 *
	 * Returns the number of rows reset so callers can log the repair
	 * for observability.
	 */
	async recoverStrandedThumbnails(): Promise<number> {
		const stranded = await getClientDb()
			.files.filter(
				(f) =>
					f.thumbnailUploadState === "uploaded" &&
					f.thumbnailCdnUrl == null &&
					f.mainOpfsPath != null &&
					canGenerateThumbnail(f.mimeType),
			)
			.toArray();

		if (stranded.length === 0) return 0;

		await getClientDb().transaction("rw", getClientDb().files, async () => {
			for (const row of stranded) {
				await getClientDb().files.update(row.id, {
					thumbnailUploadState: "pending",
					thumbnailUploadAttempts: 0,
					thumbnailLastError: null,
					thumbnailLastAttemptAt: null,
				});
			}
		});
		notifySubscribers("files", "sync");
		return stranded.length;
	},
};

function canGenerateThumbnail(mimeType: string): boolean {
	return mimeType.startsWith("image/") || mimeType === "application/pdf";
}
