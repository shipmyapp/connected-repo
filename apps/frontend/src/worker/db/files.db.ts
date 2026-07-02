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
		notifySubscribers("files");
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
		notifySubscribers("files");
	},

	async getPendingUploads(): Promise<StoredFile[]> {
		return await getClientDb().files
			.where("mainUploadState")
			.anyOf(["pending", "uploading", "failed"])
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
		notifySubscribers("files");
	},

	async setSyncError(id: string, error: string | null): Promise<void> {
		await getClientDb().files.update(id, { syncError: error });
		notifySubscribers("files");
	},
};

function canGenerateThumbnail(mimeType: string): boolean {
	return mimeType.startsWith("image/") || mimeType === "application/pdf";
}
