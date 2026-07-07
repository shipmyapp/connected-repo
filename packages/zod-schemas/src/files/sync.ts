import { z } from "zod";
import { fileSelectAllZod } from "../file.zod.js";
import {
	makePullBundlesOutput,
	pushCreateResultZod,
	syncDeltaInputZod,
} from "../sync.zod.js";

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

// HTTPS-only URL. The backend (`pushFilesCdnUpdatesService`) additionally
// validates that the host matches the configured S3/CDN allowlist so an
// attacker can't deface a file row with a phishing/tracker URL. Do NOT weaken
// this to `z.url()` — plain `z.url()` accepts any protocol and any host,
// which is the exact URL-defacement vector we are closing here.
const cdnHttpsUrlZod = z.url({ protocol: /^https$/ });

export const filePushCdnUpdateItemZod = z.object({
	id: z.ulid(),
	cdnUrl: cdnHttpsUrlZod.nullish(),
	thumbnailCdnUrl: cdnHttpsUrlZod.nullish(),
	isMainFileLost: z.boolean().nullish(),
});
export type FilePushCdnUpdateItem = z.infer<typeof filePushCdnUpdateItemZod>;

export const filePushCdnUpdatesInputZod = z.object({
	updates: z.array(filePushCdnUpdateItemZod),
});
export type FilePushCdnUpdatesInput = z.infer<typeof filePushCdnUpdatesInputZod>;

export const filePushCdnUpdateResultZod = pushCreateResultZod(fileSelectAllZod);
export type FilePushCdnUpdateResult = z.infer<typeof filePushCdnUpdateResultZod>;

export const filePushCdnUpdatesOutputZod = z.object({
	results: z.array(filePushCdnUpdateResultZod),
});
export type FilePushCdnUpdatesOutput = z.infer<typeof filePushCdnUpdatesOutputZod>;

// ─── files.pullBundles ────────────────────────────────────────────────────

export const filePullBundlesInputZod = syncDeltaInputZod;
export type FilePullBundlesInput = z.infer<typeof filePullBundlesInputZod>;

export const filePullBundlesOutputZod = makePullBundlesOutput(fileSelectAllZod);
export type FilePullBundlesOutput = z.infer<typeof filePullBundlesOutputZod>;
