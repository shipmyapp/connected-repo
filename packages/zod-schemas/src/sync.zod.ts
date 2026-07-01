import { z } from "zod";
import { tablesToSyncZod } from "./enums.zod.js";
import { zMicroSecondTimeString, zTimeEpoch } from "./zod_utils.js";

/**
 * Common sync-protocol primitives used by every per-table pull/push route.
 *
 * `updatedAt` cursors travel as base-10 microsecond-since-epoch strings —
 * JSON has no bigint, and a numeric µs epoch overflows
 * Number.MAX_SAFE_INTEGER around year 2255.
 *
 * The two-cursor protocol: `toCursor*` is the "catch-up" bookmark walked
 * with strict `>`, `fromCursor*` is the "history" bookmark walked with
 * strict `<`. Both are advanced by the server on every page. `id` (ULID)
 * is the deterministic tie-breaker at identical `updatedAt`.
 */
export const syncMetadataZod = z.object({
	teamId: z.ulid(),
	syncedTable: tablesToSyncZod,
	fromCursorId: z.ulid().nullable(),
	fromCursorUpdatedAt: zMicroSecondTimeString.nullable(),
	toCursorId: z.ulid().nullable(),
	toCursorUpdatedAt: zMicroSecondTimeString.nullable(),
	syncedAt: zTimeEpoch.nullable(),
	totalRecords: z.number().nonnegative(),
});
export type SyncMetadata = z.infer<typeof syncMetadataZod>;

/**
 * Standard input for every per-table `pullBundles` route.
 *
 * `topLevelSyncedAt` is the snapshot ceiling: minted by wave-1
 * `teams.pullBundles` as `Date.now()` and threaded through every subsequent
 * table pull in the same cycle. Downstream services filter
 * `updatedAt < topLevelSyncedAt` to keep the whole cycle consistent —
 * writes landing during the cycle become visible only in the next one.
 */
export const syncDeltaInputZod = z.object({
	syncMetadata: syncMetadataZod.nullish(),
	topLevelSyncedAt: zTimeEpoch,
});
export type SyncDeltaInput = z.infer<typeof syncDeltaInputZod>;

/**
 * Per-row acknowledgement shape shared across push routes. `row` is the
 * canonical server-owned row; on retries where `onConflictDoNothing`
 * skipped the insert the server re-fetches and returns the existing row
 * so the client's echo loop is still authoritative.
 */
export const pushCreateResultZod = <T extends z.ZodTypeAny>(rowZod: T) =>
	z.object({
		ok: z.boolean(),
		id: z.ulid(),
		row: rowZod.nullish(),
		error: z.string().nullish(),
	});
