import type { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type { SyncMetadata } from "@connected-repo/zod-schemas/sync.zod";

/**
 * Per-layer file upload state machine. Lives on the `files` Dexie row —
 * no separate queue table (mirrors tezi). Recovery on app startup / DB
 * reconnect walks every file row and re-drives the state machine from
 * whatever state it left off in.
 *
 * Transitions per layer (main + thumbnail run independently):
 *   pending → uploading → uploaded_to_cdn → uploaded
 *   pending → uploading → failed  (recovered on next attempt)
 *   pending → lost                (source disappeared before upload)
 *   * → abandoned                 (out of retries)
 */
export const FILE_UPLOAD_STATES = [
	"pending",
	"uploading",
	"uploaded_to_cdn", // CDN PUT succeeded; backend not yet told the URL
	"uploaded",         // CDN PUT succeeded AND backend has the URL
	"failed",           // last attempt failed; will retry
	"lost",             // source blob disappeared
	"abandoned",        // exhausted retries
	"not_attempted",    // thumbnail never applicable (mime type doesn't support it)
	"generating",       // thumbnail-only: generating the derived blob
] as const;
export type FileUploadState = (typeof FILE_UPLOAD_STATES)[number];

export interface StoredFile extends FileSelectAll {
	/**
	 * Sync-facing error captured on the server round-trip. Distinct from
	 * `mainLastError` (per-layer upload error) so a failed CDN upload
	 * doesn't overwrite a failed metadata push, and vice versa.
	 */
	syncError?: string | null;

	// ─── Main file upload state ────────────────────────────────────────
	mainUploadState: FileUploadState;
	mainUploadAttempts: number;
	mainLastError?: string | null;
	mainLastAttemptAt?: number | null;
	/** SHA-256 of the source blob — for CDN-first recovery + integrity check. */
	mainChecksum?: string | null;
	/** OPFS path where the original blob lives while pending. */
	mainOpfsPath?: string | null;

	// ─── Thumbnail upload state ────────────────────────────────────────
	thumbnailUploadState: FileUploadState;
	thumbnailUploadAttempts: number;
	thumbnailLastError?: string | null;
	thumbnailLastAttemptAt?: number | null;
	thumbnailChecksum?: string | null;
	thumbnailOpfsPath?: string | null;
}

/**
 * Cursor state persisted per synced table, mirroring the two-cursor
 * protocol on the server. Keyed by `syncedTable`.
 */
export interface StoredSyncMetadata extends SyncMetadata {
	/** Server-minted snapshot ceiling from the last completed wave-1 pull. */
	lastTopLevelSyncedAt?: number | null;
}

/** Persisted globally (single-row key = "app") — cross-cycle state. */
export interface SyncCycleState {
	key: "app";
	lastCompletedAt?: number;
	lastAttemptedAt?: number;
	lastError?: string | null;
}

export type { TablesToSync };
