import type { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import type { SyncMetadata } from "@connected-repo/zod-schemas/sync.zod";
import type { TeamAppMemberSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { promptsDb } from "../../modules/prompts/worker/prompts.db";
import { orpcFetch } from "../../utils/orpc.client";
import { filesDb } from "../db/files.db";
import { teamMembersDb } from "../db/team_members.db";

/**
 * Registry of the DOWNSTREAM synced tables — everything pulled after the
 * wave-1 `teamsApp` anchor (which is special: it mints `topLevelSyncedAt` and
 * has a distinct RPC shape, so it stays hand-wired in the orchestrator).
 *
 * This is the single source of truth for "which tables sync, in what order,
 * via which RPC + local adapter." Adding a new synced entity is one entry here
 * instead of edits scattered across the orchestrator's `WAVE_ORDER`, its
 * `pullTable` if-chain, and the tombstone collectors.
 *
 * Each entry's `pull` is a self-contained closure that fetches one page AND
 * mirrors it into Dexie. Fusing the two keeps the row type inside the closure,
 * so the registry stays a plain homogeneous array with no `any` — the pulled
 * row type never has to be expressed in the shared descriptor type.
 *
 * Order matters and is the array order: it preserves referential dependencies
 * (members reference teams; journal entries reference teams and members; files
 * reference journal entries).
 */

/** Standard downstream pull input, plus the identity needed for tombstones. */
export interface PullContext {
	/** Cursor for this (table, team); null on first sync. */
	cursor: SyncMetadata | null;
	/** Snapshot ceiling minted by the wave-1 anchor. */
	topLevelSyncedAt: number;
	/** Current user id — used to detect "you were removed" tombstones. */
	selfUserId: string | null;
}

export interface PullResult {
	/** Advanced cursor to persist for this (table, team). */
	syncMetadata: SyncMetadata;
	/**
	 * Team ids whose local footprint should be wiped because this page
	 * delivered a "you no longer belong here" tombstone. Empty for tables that
	 * can't carry that signal.
	 */
	wipeTeamIds: string[];
}

export interface DownstreamSyncedEntity {
	table: Exclude<TablesToSync, "teamsApp">;
	pull(ctx: PullContext): Promise<PullResult>;
}

/**
 * From a page of `team_members` rows, return the team ids for which the CURRENT
 * user's membership is tombstoned — the "you were removed" signal that drives a
 * device wipe of that team.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ KNOWN ISSUE (documented, not yet fixed) — revocation never propagates │
 * └─────────────────────────────────────────────────────────────────────┘
 * This can never fire for the case it was built for. To reach it, the client
 * must PULL its own tombstoned membership row via `pullMembersDelta`. But every
 * sync RPC — including the wave-1 anchor `teams.pullBundles` — runs behind
 * `rpcProtectedActiveTeamProcedure`, which requires a NON-DELETED `team_members`
 * row for (activeTeam, user) (apps/backend/src/procedures/protected.procedure.ts).
 * The moment an Owner removes the user, that row is soft-deleted, so every sync
 * RPC returns 403 and the tombstone can never be pulled. Consequences:
 *   - Removed-from-active-team: sync sits in a permanent error state and the
 *     device KEEPS all of the team's entries/files/OPFS blobs forever (the
 *     opposite of the intended offboarding wipe).
 *   - Removed-from-a-non-active team: no error at all; the team just goes stale
 *     locally and is never evicted.
 *   - Re-invite (partial unique index allows re-adding): once a new active
 *     membership exists, sync resumes and pulls the OLD tombstone (its
 *     updatedAt is past the frozen cursor) → wipe → cursors reset → re-pull →
 *     pulls the tombstone again → infinite wipe/re-pull loop.
 *
 * SOLUTION (planned): don't make the 403 load-bearing for a signal the client
 * needs AFTER losing access. Deliver own-membership state on the USER-scoped
 * channel, not the team-scoped one:
 *   1. In `pullTeamsAppService` (already keyed by userId, not by active-team
 *      membership), also return the caller's own membership rows INCLUDING
 *      tombstones. Revocation then propagates regardless of which team is
 *      active and regardless of the 403.
 *   2. Here, IGNORE a tombstone when a newer ACTIVE membership for the same
 *      team exists in the same batch / local DB (kills the re-invite loop).
 *   3. Treat a sync 403 on the client as a "re-verify memberships, maybe wipe"
 *      signal rather than only an error state.
 */
export function collectSelfMembershipWipes(
	rows: TeamAppMemberSelectAll[],
	selfUserId: string | null,
): string[] {
	if (!selfUserId) return [];
	return rows
		.filter((r) => r.deletedAt !== null && r.userId === selfUserId)
		.map((r) => r.teamId);
}

export const DOWNSTREAM_SYNCED_ENTITIES: readonly DownstreamSyncedEntity[] = [
	{
		table: "teamMembers",
		async pull({ cursor, topLevelSyncedAt, selfUserId }) {
			const res = await orpcFetch.teams.pullMembersDelta({
				syncMetadata: cursor,
				topLevelSyncedAt,
			});
			await teamMembersDb.bulkUpsert(res.rows);
			return {
				syncMetadata: res.syncMetadata,
				wipeTeamIds: collectSelfMembershipWipes(res.rows, selfUserId),
			};
		},
	},
	{
		table: "prompts",
		async pull({ cursor, topLevelSyncedAt }) {
			const res = await orpcFetch.prompts.pullBundles({
				syncMetadata: cursor,
				topLevelSyncedAt,
			});
			await promptsDb.bulkUpsert(res.rows);
			return { syncMetadata: res.syncMetadata, wipeTeamIds: [] };
		},
	},
	{
		table: "journalEntries",
		async pull({ cursor, topLevelSyncedAt }) {
			const res = await orpcFetch.journalEntries.pullBundles({
				syncMetadata: cursor,
				topLevelSyncedAt,
			});
			await journalEntriesDb.bulkUpsertFromServer(res.rows);
			return { syncMetadata: res.syncMetadata, wipeTeamIds: [] };
		},
	},
	{
		table: "files",
		async pull({ cursor, topLevelSyncedAt }) {
			const res = await orpcFetch.files.pullBundles({
				syncMetadata: cursor,
				topLevelSyncedAt,
			});
			await filesDb.bulkUpsertFromServer(res.rows);
			return { syncMetadata: res.syncMetadata, wipeTeamIds: [] };
		},
	},
] as const;
