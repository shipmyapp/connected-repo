import Dexie, { type Table } from "dexie";
import type { JournalEntrySelectAll, PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import type { StoredFile } from "./schema.db.types";

// --- Core Database Definition ---

export class AppDatabase extends Dexie {
  journalEntries!: Table<JournalEntrySelectAll, string>;
  prompts!: Table<PromptSelectAll, number>;
  pendingSyncJournalEntries!: Table<PendingSyncJournalEntry, string>;
  files!: Table<StoredFile, string>;

  constructor() {
    super("app_db_v1");
    
    this.version(1).stores({
      journalEntries: "journalEntryId, createdAt, updatedAt",
      prompts: "promptId, text, updatedAt",
      pendingSyncJournalEntries: "journalEntryId, createdAt, updatedAt",
      files: "fileId, pendingSyncId, mimeType",
    });

    this.version(2).stores({
      journalEntries: "journalEntryId, teamId, createdAt, updatedAt",
      prompts: "promptId, text, updatedAt",
      pendingSyncJournalEntries: "journalEntryId, teamId, createdAt, updatedAt",
      files: "fileId, pendingSyncId, mimeType, status, thumbnailStatus",
    }).upgrade((tx) => {
      return tx.table("files").toCollection().modify((file: StoredFile) => {
        file.thumbnailBlob = null;
        file.thumbnailStatus = 'pending';
        file.cdnUrls = null;
      });
    });

    this.version(3).stores({
      journalEntries: "journalEntryId, teamId, createdAt, updatedAt, [teamId+createdAt]",
      prompts: "promptId, text, updatedAt",
      pendingSyncJournalEntries: "journalEntryId, teamId, createdAt, updatedAt, [teamId+createdAt]",
      files: "fileId, pendingSyncId, mimeType, status, thumbnailStatus",
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
