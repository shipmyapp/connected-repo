import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type { StoredFile } from "./schema.db.types";

/** A file's mime type supports a generated thumbnail (image or PDF). */
export function canGenerateThumbnail(mimeType: string): boolean {
	return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

/**
 * Merge a server-authoritative file row onto the existing local row,
 * preserving client-only fields. This is the SINGLE clobber-safe merge used by
 * BOTH the pull path (`filesDb.bulkUpsertFromServer`) and the push-echo path
 * (`mergeFilesFromServer` in the journal-entries adapter).
 *
 * Pure (no DB/OPFS access) so it can be unit-tested directly.
 *
 * `cdnUrl` / `thumbnailCdnUrl` / `isMainFileLost` are client-owned in the
 * window between "uploaded to CDN" and "server acknowledged via
 * pushCdnUpdates". During that window the server row still has null/false for
 * these fields while the local row already holds the authoritative post-PUT
 * value queued for push. Falling back to `existing` when the server value is
 * empty keeps the queued push intact; a blind `{ ...existing, ...row }` would
 * let the server null overwrite the local URL — the next pushCdnUpdates then
 * sends nothing and the upload is permanently stranded. (This bug previously
 * lived in the push-echo path only, because it did the blind merge instead of
 * calling this helper.)
 *
 * Server-heals-stuck-local: if the server row already has a CDN URL, force the
 * corresponding local state to `uploaded` and clear any error, so a per-device
 * transient failure (`failed` / `abandoned` / `lost`) doesn't stay sticky after
 * the same file was uploaded on another device and mirrored down.
 */
export function mergeServerFileRow(
	existing: StoredFile | undefined,
	row: FileSelectAll,
): StoredFile {
	const serverHasMain = row.cdnUrl != null;
	const serverHasThumb = row.thumbnailCdnUrl != null;

	return {
		...row,
		cdnUrl: row.cdnUrl ?? existing?.cdnUrl ?? null,
		thumbnailCdnUrl: row.thumbnailCdnUrl ?? existing?.thumbnailCdnUrl ?? null,
		isMainFileLost: row.isMainFileLost || existing?.isMainFileLost || false,
		mainUploadState: serverHasMain
			? "uploaded"
			: existing?.mainUploadState ?? "pending",
		mainUploadAttempts: existing?.mainUploadAttempts ?? 0,
		mainLastError: serverHasMain ? null : existing?.mainLastError ?? null,
		mainLastAttemptAt: existing?.mainLastAttemptAt ?? null,
		// `mainChecksum` / `mainOpfsPath` are device-local — the blob physically
		// lives in this device's OPFS at that path. For rows arriving from the
		// server for the first time (another device uploaded), `existing` is
		// undefined and both stay null. That's correct: there's no blob to point
		// at, and the CDN URL is already set so `FileUploadWorker` has nothing to
		// do. Recovery from `isMainFileLost === true` requires a re-pick.
		mainChecksum: existing?.mainChecksum ?? null,
		mainOpfsPath: existing?.mainOpfsPath ?? null,
		thumbnailUploadState: serverHasThumb
			? "uploaded"
			: existing?.thumbnailUploadState ??
				(canGenerateThumbnail(row.mimeType) ? "pending" : "not_attempted"),
		thumbnailUploadAttempts: existing?.thumbnailUploadAttempts ?? 0,
		thumbnailLastError: serverHasThumb ? null : existing?.thumbnailLastError ?? null,
		thumbnailLastAttemptAt: existing?.thumbnailLastAttemptAt ?? null,
		thumbnailChecksum: existing?.thumbnailChecksum ?? null,
		thumbnailOpfsPath: existing?.thumbnailOpfsPath ?? null,
		syncError: existing?.syncError ?? null,
	};
}
