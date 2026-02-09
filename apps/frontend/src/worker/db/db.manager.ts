import Dexie, { type Table } from "dexie";
import type { JournalEntrySelectAll, PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { TeamAppMemberSelectAll, TeamAppSelectAll, TeamWithRole } from "@connected-repo/zod-schemas/team_app.zod";
import type { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import type { StoredFile } from "./schema.db.types";

// --- Core Database Definition ---

export class AppDatabase extends Dexie {
  journalEntries!: Table<JournalEntrySelectAll, string>;
  prompts!: Table<PromptSelectAll, number>;
  pendingSyncJournalEntries!: Table<PendingSyncJournalEntry, string>;
  files!: Table<StoredFile, string>;
  teamsApp!: Table<TeamAppSelectAll, string>;
  teamMembers!: Table<TeamAppMemberSelectAll, string>;

  constructor() {
    super("app_db_v1");

    this.version(1).stores({
      journalEntries: "journalEntryId, teamId, createdAt, updatedAt, [teamId+createdAt]",
      prompts: "promptId, teamId, text, updatedAt, [teamId+updatedAt]",
      pendingSyncJournalEntries: "journalEntryId, teamId, createdAt, updatedAt, [teamId+createdAt]",
      files: "fileId, pendingSyncId, mimeType, status, thumbnailStatus, teamId",
      teams: null,
      teamsApp: "teamAppId, name, updatedAt",
      teamMembers: "teamMemberId, teamAppId, userId, email, updatedAt",
    });

    /**
     * Future migrations strategy:
     * this.version(3).stores({ ... new schema ... }).upgrade(async (trans) => {
     *   // Handle data transformations
     * });
     */

  }
}

export const db = new AppDatabase();

// --- Generic Subscription System ---
export type AppDbTable = keyof Omit<AppDatabase, keyof Dexie | "version" | "on" | "open" | "close" | "table" | "transaction" | "vip" | "backendDb" | "use" | "observable" | "cloud" | "collection" | "delete" | "exists" | "idbdb" | "isOpen" | "name" | "on" | "open" | "options" | "tables" | "verno">;

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
  const { pendingSyncJournalEntriesDb } = await import("./pending-sync-journal-entries.db");
  const { teamsAppDb } = await import("./teams_app.db");
  
  await journalEntriesDb.wipeByTeamAppId(teamAppId);
  await pendingSyncJournalEntriesDb.wipeByTeamAppId(teamAppId);
  await teamsAppDb.wipeByTeamAppId(teamAppId);
};
