import { z } from "zod";
import { fileSelectAllZod } from "../file.zod.js";
import { syncDeltaInputZod, syncMetadataZod } from "../sync.zod.js";

// ─── files.pushCdnUpdates ───────────────────────────────────────────────
//
// Narrow patch endpoint for the THREE fields the device can only fill
// AFTER the file row has already been written to the server:
//
//   * cdnUrl           — set when the upload worker's PUT succeeds
//   * thumbnailCdnUrl  — set when the thumbnail's upload finishes
//   * isMainFileLost   — set if the local source disappeared before the
//                        worker could read it
//
// Everything else (fileName, mimeType, teamId, tableId, tableName, …) is
// captured at file-pick time on the device and rides along with the
// parent bundle's FIRST write via `journalEntries.pushCreates` /
// `journalEntries.create`.
//
// Per-field semantics:
//   * cdnUrl / thumbnailCdnUrl are only written IF the server column is
//     still null — a concurrent upload from another device can't clobber.
//   * isMainFileLost is a one-way flip: false → true.
//   * If the row is missing on the server (parent bundle hasn't landed
//     yet), return {ok:false}; the client retries with backoff.

export const filePushCdnUpdateItemZod = z.object({
	id: z.ulid(),
	cdnUrl: z.url().nullish(),
	thumbnailCdnUrl: z.url().nullish(),
	isMainFileLost: z.boolean().nullish(),
});
export type FilePushCdnUpdateItem = z.infer<typeof filePushCdnUpdateItemZod>;

export const filePushCdnUpdatesInputZod = z.object({
	updates: z.array(filePushCdnUpdateItemZod),
});
export type FilePushCdnUpdatesInput = z.infer<typeof filePushCdnUpdatesInputZod>;

export const filePushCdnUpdateResultZod = z.object({
	ok: z.boolean(),
	id: z.ulid(),
	row: fileSelectAllZod.nullish(),
	error: z.string().nullish(),
});
export type FilePushCdnUpdateResult = z.infer<typeof filePushCdnUpdateResultZod>;

export const filePushCdnUpdatesOutputZod = z.object({
	results: z.array(filePushCdnUpdateResultZod),
});
export type FilePushCdnUpdatesOutput = z.infer<typeof filePushCdnUpdatesOutputZod>;

// ─── files.pullBundles ────────────────────────────────────────────────────

export const filePullBundlesInputZod = syncDeltaInputZod;
export type FilePullBundlesInput = z.infer<typeof filePullBundlesInputZod>;

export const filePullBundlesOutputZod = z.object({
	rows: z.array(fileSelectAllZod),
	syncMetadata: syncMetadataZod,
});
export type FilePullBundlesOutput = z.infer<typeof filePullBundlesOutputZod>;
