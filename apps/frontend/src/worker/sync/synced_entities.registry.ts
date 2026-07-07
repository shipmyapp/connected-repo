import type { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import type { SyncMetadata } from "@connected-repo/zod-schemas/sync.zod";
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

/** Standard downstream pull input. */
export interface PullContext {
	/** Cursor for this (table, team); null on first sync. */
	cursor: SyncMetadata | null;
	/** Snapshot ceiling minted by the wave-1 anchor. */
	topLevelSyncedAt: number;
}

export interface PullResult {
	/** Advanced cursor to persist for this (table, team). */
	syncMetadata: SyncMetadata;
	/**
	 * Team ids whose local footprint should be wiped because this page
	 * delivered a "you no longer belong here" tombstone. Empty for tables that
	 * can't carry that signal. (Membership revocation is handled up-front by
	 * the orchestrator's `reconcileMemberships`, not here — see
	 * `membership_reconciliation.ts`.)
	 */
	wipeTeamIds: string[];
}

export interface DownstreamSyncedEntity {
	table: Exclude<TablesToSync, "teamsApp">;
	pull(ctx: PullContext): Promise<PullResult>;
}

export const DOWNSTREAM_SYNCED_ENTITIES: readonly DownstreamSyncedEntity[] = [
	{
		table: "teamMembers",
		async pull({ cursor, topLevelSyncedAt }) {
			const res = await orpcFetch.teams.pullMembersDelta({
				syncMetadata: cursor,
				topLevelSyncedAt,
			});
			await teamMembersDb.bulkUpsert(res.rows);
			return { syncMetadata: res.syncMetadata, wipeTeamIds: [] };
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
