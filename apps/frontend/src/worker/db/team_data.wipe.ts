import { OPFSManager } from "../utils/opfs.manager";
import { getClientDb } from "./db.lifecycle";
import { notifySubscribers } from "./db.manager";

/**
 * Purge every local trace of a team.
 *
 * Called when the user leaves a team (or is removed from one) so their
 * local cache stops trying to sync it. Distinct from the per-user DB
 * wipe (`db.lifecycle.ts`) — this is one-team scoped; the DB file stays.
 *
 * Wipes, in order:
 *   1. OPFS blobs for every file row in this team (pending uploads that
 *      never got to the CDN — no point keeping the bytes).
 *   2. `files` rows for this team (parent + orphan cleanup).
 *   3. `journal_entries` rows for this team.
 *   4. `team_members` rows for this team.
 *   5. The `teams_app` row itself.
 *   6. Every `sync_metadata` cursor scoped to this team so a rejoin
 *      pulls from scratch.
 */
export async function wipeTeamData(teamId: string): Promise<void> {
	const db = getClientDb();

	// Fetch OPFS paths BEFORE dropping the file rows.
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
