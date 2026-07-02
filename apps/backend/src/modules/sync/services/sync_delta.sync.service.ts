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
 * Generic pull-delta engine. Implements the two-cursor protocol:
 *
 *   - `toCursor*`   → strictly `>` (catch up on rows newer than the last sync)
 *   - `fromCursor*` → strictly `<` (paginate history older than what we have)
 *
 * Both cursors walk in one query via an `OR` predicate. Rows come back
 * `ORDER BY updatedAt DESC, id DESC` (ULID `id` is the deterministic
 * tie-breaker at identical `updatedAt`).
 *
 * `topLevelSyncedAt` is a turn-scoped snapshot ceiling minted by the wave-1
 * anchor (`teams.pullBundles`) as `Date.now()`. Every downstream table filters
 * `updatedAt < topLevelSyncedAt` so a single sync cycle sees a consistent
 * snapshot even across multiple round-trips. Writes that land during the
 * cycle become visible only in the next one.
 *
 * Soft-deleted rows are INCLUDED in the output (tombstones) so the client can
 * evict them from the local Dexie cache.
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

	let query = scopedBaseQuery
		.order({ updatedAt: "DESC", id: "DESC" })
		.where({ updatedAt: { lt: new Date(topLevelSyncedAt) } })
		.limit(limit);

	const fromCursorId = syncMetadataInput?.fromCursorId ?? null;
	const fromCursorUpdatedAt = syncMetadataInput?.fromCursorUpdatedAt ?? null;
	const toCursorId = syncMetadataInput?.toCursorId ?? null;
	const toCursorUpdatedAt = syncMetadataInput?.toCursorUpdatedAt ?? null;

	const orQuery: Record<string, unknown>[] = [];

	if (toCursorUpdatedAt !== null) {
		const ts = toPgTimestamp(toCursorUpdatedAt);
		orQuery.push({ updatedAt: { gt: ts } });
		if (toCursorId) orQuery.push({ updatedAt: ts, id: { gt: toCursorId } });
	}

	if (fromCursorUpdatedAt !== null) {
		const ts = toPgTimestamp(fromCursorUpdatedAt);
		orQuery.push({ updatedAt: { lt: ts } });
		if (fromCursorId) orQuery.push({ updatedAt: ts, id: { lt: fromCursorId } });
	}

	if (orQuery.length > 0) {
		query = query.where({ OR: orQuery });
	}

	const [rawList, totalCount] = await Promise.all([
		query.selectAll(),
		scopedBaseQuery.count(),
	]);
	const data = rawList as T[];

	let advancedFromCursorId = fromCursorId;
	let advancedFromCursorUpdatedAt = fromCursorUpdatedAt;
	let advancedToCursorId = toCursorId;
	let advancedToCursorUpdatedAt = toCursorUpdatedAt;

	const firstItem = data[0];
	const lastItem = data[data.length - 1];

	if (firstItem) {
		const rowGtToCursor =
			firstItem.updatedAt > (toCursorUpdatedAt ?? "0") ||
			(firstItem.updatedAt === toCursorUpdatedAt &&
				firstItem.id > (toCursorId ?? ""));
		if (rowGtToCursor) {
			advancedToCursorId = firstItem.id;
			advancedToCursorUpdatedAt = firstItem.updatedAt;
		}
	}

	if (lastItem) {
		const rowLtFromCursor =
			fromCursorUpdatedAt === null ||
			lastItem.updatedAt < fromCursorUpdatedAt ||
			(lastItem.updatedAt === fromCursorUpdatedAt &&
				lastItem.id < (fromCursorId ?? ""));
		if (rowLtFromCursor) {
			advancedFromCursorId = lastItem.id;
			advancedFromCursorUpdatedAt = lastItem.updatedAt;
		}
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
