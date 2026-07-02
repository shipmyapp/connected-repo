import { getDataProxy } from "@frontend/worker/worker.proxy";
import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import type {
	TeamAppMemberSelectAll,
	TeamAppSelectAll,
} from "@connected-repo/zod-schemas/team_app.zod";

/**
 * Common seam for "mirror an RPC response into the local Dexie DB".
 *
 * Call this after any RPC that returns authoritative entity rows
 * (create, update, getById, getDefaultTeam, etc.) so the local mirror
 * is consistent immediately — without waiting for the next sync pull
 * cycle to bring the row down.
 *
 * Awaits `sync.waitForReady()` internally, so callers can safely fire
 * this before `initSyncForUser` has resolved (e.g. from `authLoader`).
 * The write queues until the per-user Dexie DB is open.
 *
 * When adding a new synced table, add its entry to `MirrorPayload` and
 * route it in the switch below. The switch is exhaustive, so TS will
 * flag missing cases.
 */
export type MirrorPayload =
	| { table: "teamsApp"; rows: TeamAppSelectAll[] }
	| { table: "teamMembers"; rows: TeamAppMemberSelectAll[] }
	| { table: "prompts"; rows: PromptSelectAll[] }
	| { table: "journalEntries"; rows: JournalEntrySelectAll[] }
	| { table: "files"; rows: FileSelectAll[] };

export async function mirrorToLocalDb(payload: MirrorPayload): Promise<void> {
	if (payload.rows.length === 0) return;
	try {
		const proxy = await getDataProxy();
		await proxy.sync.waitForReady();
		switch (payload.table) {
			case "teamsApp":
				await proxy.teamsAppDb.bulkUpsert(payload.rows);
				return;
			case "teamMembers":
				await proxy.teamMembersDb.bulkUpsert(payload.rows);
				return;
			case "prompts":
				await proxy.promptsDb.bulkUpsert(payload.rows);
				return;
			case "journalEntries":
				await proxy.journalEntriesDb.bulkUpsertFromServer(payload.rows);
				return;
			case "files":
				await proxy.filesDb.bulkUpsertFromServer(payload.rows);
				return;
		}
	} catch (err) {
		// Non-fatal — the next sync cycle will bring the row down anyway.
		// Surface in devtools so a persistent failure is diagnosable.
		console.warn("[mirrorToLocalDb] write failed", {
			table: payload.table,
			err,
		});
	}
}
