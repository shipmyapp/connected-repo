import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import { OPFSManager } from "../utils/opfs.manager";
import { getClientDb } from "./db.lifecycle";
import { notifySubscribers } from "./db.manager";
import type { FileUploadState, StoredFile } from "./schema.db.types";

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
	 * Local write for an offline-created file. Called by the media pick
	 * flow. The blob is stripped from the object and written to OPFS
	 * before Dexie sees the row.
	 */
	async upsertLocal(
		input: FileSelectAll & { _blob?: Blob; _thumbnailBlob?: Blob | null },
	): Promise<StoredFile> {
		const { _blob, _thumbnailBlob, ..._rest } = input;
		const rest = _rest as FileSelectAll;

		let mainOpfsPath: string | null = null;
		let mainChecksum: string | null = null;
		if (_blob) {
			const ext = _blob.type.split("/").pop() ?? "bin";
			mainOpfsPath = `files/${rest.id}/original.${ext}`;
			mainChecksum = await OPFSManager.calculateChecksum(_blob);
			await OPFSManager.saveFile(mainOpfsPath, _blob);
		}

		let thumbOpfsPath: string | null = null;
		let thumbChecksum: string | null = null;
		if (_thumbnailBlob) {
			thumbOpfsPath = `files/${rest.id}/thumbnail.jpg`;
			thumbChecksum = await OPFSManager.calculateChecksum(_thumbnailBlob);
			await OPFSManager.saveFile(thumbOpfsPath, _thumbnailBlob);
		}

		const stored: StoredFile = {
			...rest,
			mainUploadState: "pending",
			mainUploadAttempts: 0,
			mainLastError: null,
			mainLastAttemptAt: null,
			mainChecksum,
			mainOpfsPath,
			thumbnailUploadState: canGenerateThumbnail(rest.mimeType) ? "pending" : "not_attempted",
			thumbnailUploadAttempts: 0,
			thumbnailLastError: null,
			thumbnailLastAttemptAt: null,
			thumbnailChecksum: thumbChecksum,
			thumbnailOpfsPath: thumbOpfsPath,
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
				const merged: StoredFile = {
					...row,
					mainUploadState:
						existing?.mainUploadState ?? (row.cdnUrl ? "uploaded" : "pending"),
					mainUploadAttempts: existing?.mainUploadAttempts ?? 0,
					mainLastError: existing?.mainLastError ?? null,
					mainLastAttemptAt: existing?.mainLastAttemptAt ?? null,
					mainChecksum: existing?.mainChecksum ?? null,
					mainOpfsPath: existing?.mainOpfsPath ?? null,
					thumbnailUploadState:
						existing?.thumbnailUploadState ??
						(row.thumbnailCdnUrl
							? "uploaded"
							: canGenerateThumbnail(row.mimeType)
								? "pending"
								: "not_attempted"),
					thumbnailUploadAttempts: existing?.thumbnailUploadAttempts ?? 0,
					thumbnailLastError: existing?.thumbnailLastError ?? null,
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
