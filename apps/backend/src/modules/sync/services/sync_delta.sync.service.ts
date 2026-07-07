import { sql } from "@backend/db/base_table";
import { getRequestContext } from "@backend/lib/request-context";
import type { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import type { SyncMetadata } from "@connected-repo/zod-schemas/sync.zod";
import { ORPCError } from "@orpc/server";
import type { Query } from "orchid-orm";

export interface SyncDeltaOptions {
	/**
	 * Pre-scoped ORM query — the caller applies any tenant / user filters
	 * before passing it in (e.g. `db.journalEntries.where({ teamId })` or
	 * `db.teamMembers.where({ userId })`). The service adds the sync-delta
	 * predicates (cursors + topLevelSyncedAt ceiling) on top.
	 *
	 * `__scopes: { nonDeleted: true }` is orchid-orm's requirement for
	 * `.includeDeleted()` to be callable — every synced table declares
	 * `readonly softDelete = true` which installs the `nonDeleted` scope.
	 */
	baseQuery: Query & { __scopes: { nonDeleted: true }; __readOnly: undefined };
	syncMetadataInput?: SyncMetadata | null;
	topLevelSyncedAt: number;
	syncedTable: TablesToSync;
	limit?: number;
}

/**
 * Cast a base-10 microsecond epoch string into a Postgres timestamp.
 * `numeric / 1000000` keeps the microsecond precision through the cast
 * (no double-to-float truncation).
 */
const toPgTimestamp = (usStr: string) =>
	sql`to_timestamp(${usStr}::numeric / 1000000)`;

/**
 * Generic pull-delta engine. Implements a two-cursor protocol with the two
 * directions run as SEPARATE queries so neither can skip rows:
 *
 *   - Catch-up (`toCursor`): rows strictly NEWER than `toCursor`, ordered
 *     `updatedAt ASC, id ASC`, advancing `toCursor` to the LAST (newest) row
 *     fetched. Ascending + advance-to-last guarantees the next pull resumes
 *     exactly where this one stopped, so it stays complete even when more than
 *     `limit` rows changed since the last sync.
 *   - Backfill (`fromCursor`): history strictly OLDER than `fromCursor`,
 *     ordered `updatedAt DESC, id DESC`, advancing `fromCursor` to the LAST
 *     (oldest) row fetched. On the first sync (`fromCursor` null) this starts
 *     at the snapshot ceiling and walks down, seeding the window and also
 *     seeding `toCursor` from the newest row of that first page.
 *
 * WHY SEPARATE QUERIES: the previous design merged both directions into one
 * `ORDER BY updatedAt DESC LIMIT n` query and advanced `toCursor` to the
 * NEWEST row of the page. When more than `limit` rows were newer than
 * `toCursor`, the DESC page returned only the newest `limit`, `toCursor`
 * jumped to the very newest, and the older-but-still-new rows in between fell
 * into the gap between the two cursors — silently lost until some later write
 * bumped their `updatedAt`. Ascending catch-up removes that gap entirely.
 *
 * `id` (a ULID) is the deterministic tie-breaker at identical `updatedAt`.
 *
 * `topLevelSyncedAt` is a turn-scoped snapshot ceiling minted by the wave-1
 * anchor (`teams.pullBundles`) as `Date.now()`. Every direction filters
 * `updatedAt < topLevelSyncedAt` so a single sync cycle sees a consistent
 * snapshot even across multiple round-trips. Writes that land during the
 * cycle become visible only in the next one.
 *
 * Soft-deleted rows are INCLUDED in the output (tombstones) so the client can
 * evict them from the local Dexie cache. Catch-up and backfill ranges are
 * disjoint (`toCursor >= fromCursor` always), and the client applies rows with
 * an idempotent `bulkPut`, so returning both directions in one response is safe.
 */
export async function syncDeltaService<
	T extends { id: string; updatedAt: string },
>({
	baseQuery,
	syncMetadataInput,
	topLevelSyncedAt,
	syncedTable,
	limit = 100,
}: SyncDeltaOptions): Promise<{ data: T[]; syncMetadata: SyncMetadata }> {
	const ctx = getRequestContext();
	if (!ctx) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "No active session context",
		});
	}
	const teamId = ctx.tenantTeamId;

	if (syncMetadataInput?.teamId && teamId !== syncMetadataInput.teamId) {
		throw new ORPCError("BAD_REQUEST", {
			status: 400,
			message: "Active team id mismatched with sync metadata cursor",
		});
	}

	// Tombstones are intentional — the client uses them to invalidate its
	// local cache. `nonDeleted` is bypassed here; any tenant scope the caller
	// pre-applied is preserved.
	const scopedBaseQuery = baseQuery.includeDeleted();
	const ceiling = new Date(topLevelSyncedAt);

	const fromCursorId = syncMetadataInput?.fromCursorId ?? null;
	const fromCursorUpdatedAt = syncMetadataInput?.fromCursorUpdatedAt ?? null;
	const toCursorId = syncMetadataInput?.toCursorId ?? null;
	const toCursorUpdatedAt = syncMetadataInput?.toCursorUpdatedAt ?? null;

	// ── Catch-up: rows strictly NEWER than `toCursor`, ascending. ───────────
	let catchUpRows: T[] = [];
	if (toCursorUpdatedAt !== null) {
		const ts = toPgTimestamp(toCursorUpdatedAt);
		const orQuery: Record<string, unknown>[] = [{ updatedAt: { gt: ts } }];
		if (toCursorId) orQuery.push({ updatedAt: ts, id: { gt: toCursorId } });
		catchUpRows = (await scopedBaseQuery
			.where({ updatedAt: { lt: ceiling } })
			.where({ OR: orQuery })
			.order({ updatedAt: "ASC", id: "ASC" })
			.limit(limit)
			.selectAll()) as T[];
	}

	// ── Backfill: history strictly OLDER than `fromCursor`, descending. ─────
	let backfillQuery = scopedBaseQuery
		.where({ updatedAt: { lt: ceiling } })
		.order({ updatedAt: "DESC", id: "DESC" })
		.limit(limit);
	if (fromCursorUpdatedAt !== null) {
		const ts = toPgTimestamp(fromCursorUpdatedAt);
		const orQuery: Record<string, unknown>[] = [{ updatedAt: { lt: ts } }];
		if (fromCursorId) orQuery.push({ updatedAt: ts, id: { lt: fromCursorId } });
		backfillQuery = backfillQuery.where({ OR: orQuery });
	}

	const [backfillRaw, totalCount] = await Promise.all([
		backfillQuery.selectAll(),
		scopedBaseQuery.count(),
	]);
	const backfillRows = backfillRaw as T[];

	const data: T[] = [...catchUpRows, ...backfillRows];

	// ── Advance cursors ─────────────────────────────────────────────────────
	let advancedFromCursorId = fromCursorId;
	let advancedFromCursorUpdatedAt = fromCursorUpdatedAt;
	let advancedToCursorId = toCursorId;
	let advancedToCursorUpdatedAt = toCursorUpdatedAt;

	// `toCursor` → newest confirmed row from the top of the window. Catch-up is
	// ascending, so its newest row is the last element. On the first sync there
	// is no catch-up; seed `toCursor` from the newest backfill row instead.
	const newestCatchUp = catchUpRows[catchUpRows.length - 1];
	if (newestCatchUp) {
		advancedToCursorId = newestCatchUp.id;
		advancedToCursorUpdatedAt = newestCatchUp.updatedAt;
	} else if (toCursorUpdatedAt === null) {
		const newestBackfill = backfillRows[0]; // DESC → [0] is newest
		if (newestBackfill) {
			advancedToCursorId = newestBackfill.id;
			advancedToCursorUpdatedAt = newestBackfill.updatedAt;
		}
	}

	// `fromCursor` → oldest row we've paginated down to. Backfill is descending,
	// so its oldest row is the last element.
	const oldestBackfill = backfillRows[backfillRows.length - 1];
	if (oldestBackfill) {
		advancedFromCursorId = oldestBackfill.id;
		advancedFromCursorUpdatedAt = oldestBackfill.updatedAt;
	}

	const syncMetadata: SyncMetadata = {
		teamId,
		syncedTable,
		fromCursorId: advancedFromCursorId,
		fromCursorUpdatedAt: advancedFromCursorUpdatedAt,
		toCursorId: advancedToCursorId,
		toCursorUpdatedAt: advancedToCursorUpdatedAt,
		syncedAt: Date.now(),
		totalRecords: Number(totalCount),
	};

	return { data, syncMetadata };
}
