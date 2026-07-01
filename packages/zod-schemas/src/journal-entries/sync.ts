import { z } from "zod";
import { fileCreateInputZod, fileSelectAllZod } from "../file.zod.js";
import {
	journalEntryCreateInputZod,
	journalEntrySelectAllZod,
} from "../journal_entry.zod.js";
import { syncDeltaInputZod, syncMetadataZod } from "../sync.zod.js";

/**
 * The create-input shape used by BOTH the online `journalEntries.create`
 * route AND the offline `journalEntries.pushCreates` route. Same input,
 * two handlers — the payload does not branch between the two write paths.
 *
 * File metadata always rides with the parent. CDN URLs are patched in
 * later via `files.pushCdnUpdates` once the local FileUploadWorker
 * finishes uploading the blob.
 */
export const journalEntryCreateInputWithRelationsZod = journalEntryCreateInputZod.extend({
	files: z.array(fileCreateInputZod).nullish(),
});
export type JournalEntryCreateInputWithRelations = z.infer<
	typeof journalEntryCreateInputWithRelationsZod
>;

export const journalEntrySelectAllWithRelationsZod = journalEntrySelectAllZod.extend({
	files: z.array(fileSelectAllZod),
});
export type JournalEntrySelectAllWithRelations = z.infer<
	typeof journalEntrySelectAllWithRelationsZod
>;

// ─── pushCreates ─────────────────────────────────────────────────────────

export const journalEntryPushCreatesInputZod = z.object({
	creates: z.array(journalEntryCreateInputWithRelationsZod),
});
export type JournalEntryPushCreatesInput = z.infer<typeof journalEntryPushCreatesInputZod>;

export const journalEntryPushCreatesResultZod = z.object({
	ok: z.boolean(),
	id: z.ulid(),
	row: journalEntrySelectAllWithRelationsZod.nullish(),
	error: z.string().nullish(),
});
export type JournalEntryPushCreatesResult = z.infer<typeof journalEntryPushCreatesResultZod>;

export const journalEntryPushCreatesOutputZod = z.object({
	results: z.array(journalEntryPushCreatesResultZod),
});
export type JournalEntryPushCreatesOutput = z.infer<typeof journalEntryPushCreatesOutputZod>;

// ─── pullBundles ───────────────────────────────────────────────────────────

export const journalEntryPullBundlesInputZod = syncDeltaInputZod;
export type JournalEntryPullBundlesInput = z.infer<typeof journalEntryPullBundlesInputZod>;

export const journalEntryPullBundlesOutputZod = z.object({
	rows: z.array(journalEntrySelectAllZod),
	syncMetadata: syncMetadataZod,
});
export type JournalEntryPullBundlesOutput = z.infer<typeof journalEntryPullBundlesOutputZod>;
