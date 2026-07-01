import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import type {
	TeamAppMemberSelectAll,
	TeamAppSelectAll,
} from "@connected-repo/zod-schemas/team_app.zod";
import Dexie, { type Table } from "dexie";
import type { StoredFile, StoredSyncMetadata, SyncCycleState } from "./schema.db.types";

/**
 * Local mirror of the server's synced tables plus a small amount of
 * client-only state (cursors, file-upload machine, sync cycle telemetry).
 *
 * The DB is **per-user** — the DB name is `app_db_v1_${userId}`. See
 * `db.lifecycle.ts` for open/close/switch semantics. On this-device
 * user-switch, the previous user's DB is dropped before opening the
 * new one; a user logging back in on the same device rehydrates their
 * own DB.
 *
 * Pending vs confirmed rows share the same Dexie table — a row is
 * "pending" when `createdAt` is falsy (`null` / `undefined` / `0`).
 *
 * Cross-context reactivity uses a hand-rolled `BroadcastChannel` (see
 * `notifySubscribers`) — Dexie's own `liveQuery` doesn't cross the
 * worker boundary.
 */

export type Pending<T extends { createdAt?: number | null }> = Omit<T, "createdAt"> & {
	createdAt: number | null;
};

export type WithSyncStatus<T extends { createdAt?: number | null }> = Pending<T> & {
	syncError?: string | null;
};

export const DEXIE_VERSION = 3;
export const DEXIE_DB_NAME_PREFIX = "app_db_v1_";

export const dbNameFor = (userId: string): string => `${DEXIE_DB_NAME_PREFIX}${userId}`;

export class ClientDatabase extends Dexie {
	journalEntries!: Table<WithSyncStatus<JournalEntrySelectAll>, string>;
	prompts!: Table<PromptSelectAll, string>;
	files!: Table<StoredFile, string>;
	teamsApp!: Table<TeamAppSelectAll, string>;
	teamMembers!: Table<TeamAppMemberSelectAll, string>;
	syncMetadata!: Table<StoredSyncMetadata, [string, string]>;
	syncState!: Table<SyncCycleState, string>;

	constructor(dbName: string) {
		super(dbName);

		this.version(DEXIE_VERSION).stores({
			// createdAt is the pending-vs-confirmed marker (null = pending).
			// [teamId+updatedAt] powers the tezi-style two-cursor local ordering.
			journalEntries: "id, teamId, createdAt, updatedAt, syncError, [teamId+updatedAt]",
			prompts: "id, updatedAt, [updatedAt+id]",
			files: "id, tableId, tableName, type, teamId, updatedAt, mainUploadState, thumbnailUploadState, createdAt, syncError",
			teamsApp: "id, updatedAt",
			teamMembers: "id, userId, teamId, updatedAt",
			// Composite PK: cursors are per-(table, team) so switching teams
			// doesn't collide. Client sends the correct cursor for the current
			// active team; the server rejects a cross-team cursor.
			syncMetadata: "[syncedTable+teamId], syncedTable, teamId",
			// singleton — key = "app"
			syncState: "key",
		});
	}
}

// ─── Cross-context reactivity ───────────────────────────────────────────
//
// The DataWorker mutates Dexie; the main thread reads through hooks. Both
// need to know when a table changed. `BroadcastChannel` fans out to every
// same-origin document + worker, so a single write notifies all of them.

export type AppDbTable =
	| "journalEntries"
	| "prompts"
	| "files"
	| "teamsApp"
	| "teamMembers"
	| "syncMetadata"
	| "syncState";

const dbUpdatesChannel = new BroadcastChannel("db-updates");
const subscribers = new Set<(table: AppDbTable) => void>();

dbUpdatesChannel.onmessage = (event) => {
	const table = (event.data as { table?: AppDbTable } | undefined)?.table;
	if (!table) return;
	for (const cb of subscribers) cb(table);
};

/**
 * Notify every subscriber in this context AND every other same-origin
 * context that `table` changed. Callers MUST invoke this after every
 * write, otherwise UI hooks won't refetch.
 */
export const notifySubscribers = (table: AppDbTable): void => {
	for (const cb of subscribers) cb(table);
	dbUpdatesChannel.postMessage({ table });
};

export const subscribe = (callback: (table: AppDbTable) => void): (() => void) => {
	subscribers.add(callback);
	return () => {
		subscribers.delete(callback);
	};
};

// ─── Type aliases for module DB adapters ────────────────────────────────

export type StoredJournalEntry = WithSyncStatus<JournalEntrySelectAll>;
export type StoredPrompt = PromptSelectAll;
export type StoredTeam = TeamAppSelectAll;
export type StoredTeamMember = TeamAppMemberSelectAll;

export type { FileSelectAll };
