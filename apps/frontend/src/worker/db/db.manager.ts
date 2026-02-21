import Dexie, { type Table, type Transaction } from "dexie";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { TeamAppMemberSelectAll, TeamAppSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import type { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import type { StoredFile, SyncMetadata, PendingAction, JournalEntrySyncMetadata } from "./schema.db.types";

// --- Database Table Types with Sync Metadata ---
export type WithSync<T> = T & {
  _pendingAction?: PendingAction | null;
} & Partial<JournalEntrySyncMetadata>;

export class ClientDatabase extends Dexie {
  journalEntries!: Table<WithSync<JournalEntrySelectAll>, string>;
  prompts!: Table<WithSync<PromptSelectAll>, number>;
  files!: Table<StoredFile, string>;
  teamsApp!: Table<WithSync<TeamAppSelectAll>, string>;
  teamMembers!: Table<WithSync<TeamAppMemberSelectAll>, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super("app_db_v1");

    // Version 2 (Event-Driven Sync)
    this.version(2).stores({
      journalEntries: "id, teamId, createdAt, updatedAt, clientUpdatedAt, _pendingAction, [teamId+createdAt]",
      prompts: "id, teamId, text, updatedAt, clientUpdatedAt, _pendingAction, [teamId+updatedAt]",
      files: "fileId, pendingSyncId, mimeType, status, thumbnailStatus, teamId",
      teamsApp: "id, name, updatedAt, clientUpdatedAt, _pendingAction",
      teamMembers: "id, id, userId, email, updatedAt, clientUpdatedAt, _pendingAction",
      syncMetadata: "tableName",
    })

    /**
     * Future migrations strategy:
     * this.version(3).stores({ ... new schema ... }).upgrade(async (trans) => {
     *   // Handle data transformations
     * });
     */
  }
}

export const clientDb = new ClientDatabase();

// --- Generic Subscription System ---
export type AppDbTable = keyof Omit<ClientDatabase, keyof Dexie | "version" | "on" | "open" | "close" | "table" | "transaction" | "vip" | "backendDb" | "use" | "observable" | "cloud" | "collection" | "delete" | "exists" | "idbdb" | "isOpen" | "name" | "on" | "open" | "options" | "tables" | "verno">;

const dbUpdatesChannel = new BroadcastChannel("db-updates");
const subscribers: Set<(table: AppDbTable) => void> = new Set();

export const notifySubscribers = (table: AppDbTable) => {
  // Notify local subscribers (same context)
  for (const callback of subscribers) {
    callback(table);
  }
  // Notify other workers (different context)
  dbUpdatesChannel.postMessage({ table });
};

export const subscribe = (callback: (table: AppDbTable) => void) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};

export const wipeTeamData = async (teamId: string) => {
  console.warn(`[DBManager] PERMANENTLY WIPING all data for team: ${teamId}`);
  
  const { journalEntriesDb } = await import("../../modules/journal-entries/worker/journal-entries.db");
  const { teamsAppDb } = await import("./teams_app.db");
  
  await journalEntriesDb.wipeByTeamAppId(teamId);
  await teamsAppDb.wipeByTeamAppId(teamId);
};
