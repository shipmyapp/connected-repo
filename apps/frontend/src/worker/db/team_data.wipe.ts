import { OPFSManager } from "../utils/opfs.manager";
import { getClientDb } from "./db.lifecycle";
import { notifySubscribers } from "./db.manager";

/**
 * Purge every local trace of a team.
 *
 * Called from `SyncOrchestrator.runCycle` when a pull wave delivers a
 * tombstone for either:
 *   - a `teams` row the client already has locally (team deleted server-
 *     side), or
 *   - a `team_members` row for the current user (membership revoked).
 *
 * Distinct from the per-user DB wipe in `db.lifecycle.ts` — this is
 * one-team scoped; the DB file stays. Distinct from the OPFS wipe on
 * user-switch — that blasts the whole `files/` tree; this one enumerates
 * only the paths belonging to this team's file rows.
 *
 * Order matters:
 *   1. Enumerate OPFS paths from the `files` rows BEFORE dropping them
 *      (once rows are gone, we can't recover the paths).
 *   2. In one Dexie transaction, delete: journal entries → files →
 *      team members → the team row itself → every sync_metadata cursor
 *      scoped to this team. All-or-nothing so a crash mid-wipe doesn't
 *      leave orphan rows referencing a deleted team.
 *   3. OPFS blobs are removed AFTER the transaction commits. Failures
 *      leak disk space but don't corrupt the DB — a subsequent user-
 *      switch will `wipeDirectory("files")` and reclaim them anyway.
 *
 * Notifies subscribers on every touched table so React Query hooks
 * refetch and the UI reflects the wipe immediately.
 */
export async function wipeTeamDataFromDb(teamId: string): Promise<void> {
	const db = getClientDb();

	// Enumerate OPFS paths BEFORE the row delete — the paths only exist
	// on the `files` rows we're about to drop. OPFS paths themselves are
	// `files/{fileId}/...` (not team-scoped), so we can't derive them
	// from teamId alone — we have to walk the rows.
	const teamFiles = await db.files.where({ teamId }).toArray();
	const opfsPaths = teamFiles.flatMap((f) =>
		[f.mainOpfsPath, f.thumbnailOpfsPath].filter((p): p is string => !!p),
	);

	await db.transaction(
		"rw",
		[db.journalEntries, db.files, db.teamMembers, db.teamsApp, db.syncMetadata],
		async () => {
			await db.journalEntries.where({ teamId }).delete();
			await db.files.where({ teamId }).delete();
			await db.teamMembers.where({ teamId }).delete();
			await db.teamsApp.where({ id: teamId }).delete();
			await db.syncMetadata.where({ teamId }).delete();
		},
	);

	// Best-effort OPFS cleanup outside the transaction — failures here
	// leak disk space but don't corrupt the DB.
	await Promise.all(opfsPaths.map((p) => OPFSManager.deleteFile(p)));

	notifySubscribers("journalEntries");
	notifySubscribers("files");
	notifySubscribers("teamMembers");
	notifySubscribers("teamsApp");
	notifySubscribers("syncMetadata");
}
