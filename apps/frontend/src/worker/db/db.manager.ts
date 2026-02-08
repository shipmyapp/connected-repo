import Dexie, { type Table } from "dexie";
import type { JournalEntrySelectAll, PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";

export interface StoredFile {
  fileId: string;
  pendingSyncId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  createdAt: number;
  status: "pending" | "in-progress" | "completed" | "failed";
  error?: string;
  errorCount: number;
}

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

const subscribers: Set<(table: string) => void> = new Set();

export const notifySubscribers = (table: string) => {
  for (const callback of subscribers) {
    callback(table);
  }
};

export const subscribe = (callback: (table: string) => void) => {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
};
