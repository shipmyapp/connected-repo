import Dexie, { type Table, type Transaction } from "dexie";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { TeamAppMemberSelectAll, TeamAppSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import type { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import type { StoredFile, SyncMetadata, SyncConflict, PendingAction, JournalEntrySyncMetadata } from "./schema.db.types";

// --- Database Table Types with Sync Metadata ---
export type WithSync<T> = T & {
  _pendingAction?: PendingAction | null;
  clientUpdatedAt: number;
} & Partial<JournalEntrySyncMetadata>;

export class ClientDatabase extends Dexie {
  journalEntries!: Table<WithSync<JournalEntrySelectAll>, string>;
  prompts!: Table<WithSync<PromptSelectAll>, number>;
  files!: Table<StoredFile, string>;
  teamsApp!: Table<WithSync<TeamAppSelectAll>, string>;
  teamMembers!: Table<WithSync<TeamAppMemberSelectAll>, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  syncConflicts!: Table<SyncConflict, number>;

  constructor() {
    super("app_db_v1");

    // Version 1 (Legacy)
    this.version(1).stores({
      journalEntries: "journalEntryId, teamId, createdAt, updatedAt, [teamId+createdAt]",
      prompts: "promptId, teamId, text, updatedAt, [teamId+updatedAt]",
      pendingSyncJournalEntries: "journalEntryId, teamId, createdAt, updatedAt, [teamId+createdAt]",
      files: "fileId, pendingSyncId, mimeType, status, thumbnailStatus, teamId",
      teams: null,
      teamsApp: "teamAppId, name, updatedAt",
      teamMembers: "teamMemberId, teamAppId, userId, email, updatedAt",
    });

    // Version 2 (Event-Driven Sync)
    this.version(2).stores({
      journalEntries: "journalEntryId, teamId, createdAt, updatedAt, clientUpdatedAt, _pendingAction, [teamId+createdAt]",
      prompts: "promptId, teamId, text, updatedAt, clientUpdatedAt, _pendingAction, [teamId+updatedAt]",
      files: "fileId, pendingSyncId, mimeType, status, thumbnailStatus, teamId",
      teamsApp: "teamAppId, name, updatedAt, clientUpdatedAt, _pendingAction",
      teamMembers: "teamMemberId, teamAppId, userId, email, updatedAt, clientUpdatedAt, _pendingAction",
      syncMetadata: "tableName",
      syncConflicts: "++conflictId, tableName, recordId, conflictedAt",
      pendingSyncJournalEntries: null, // Delete legacy table
    }).upgrade(async (trans: Transaction) => {
      // Migration: Move legacy pending entries to journalEntries
      const legacyPending = trans.table("pendingSyncJournalEntries");
      const mainEntries = trans.table("journalEntries");
      
      const pendingItems = await legacyPending.toArray();
      for (const item of pendingItems) {
        await mainEntries.put({
          ...item,
          _pendingAction: 'create',
          clientUpdatedAt: item.updatedAt || Date.now()
        });
      }
    });

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

export const wipeTeamData = async (teamAppId: string) => {
  console.warn(`[DBManager] PERMANENTLY WIPING all data for team: ${teamAppId}`);
  
  const { journalEntriesDb } = await import("../../modules/journal-entries/worker/journal-entries.db");
  const { teamsAppDb } = await import("./teams_app.db");
  
  await journalEntriesDb.wipeByTeamAppId(teamAppId);
  await teamsAppDb.wipeByTeamAppId(teamAppId);
};
