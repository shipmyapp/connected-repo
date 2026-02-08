import { pendingSyncJournalEntryZod, type PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import { db, notifySubscribers } from "./db.manager";
import { filesDb } from "./files.db";

export class PendingSyncJournalEntriesDBManager {
  async add(entry: PendingSyncJournalEntry) {
    await db.pendingSyncJournalEntries.add(pendingSyncJournalEntryZod.parse(entry));
    notifySubscribers("pendingSyncJournalEntries");
  }

  async getAll() {
    return await db.pendingSyncJournalEntries.orderBy("createdAt").reverse().toArray();
  }

  async delete(id: string) {
    await db.pendingSyncJournalEntries.delete(id);
    // Also remove associated files via central filesDb
    await filesDb.deleteFilesByPendingSyncId(id);
    notifySubscribers("pendingSyncJournalEntries");
  }
}

export const pendingSyncJournalEntriesDb = new PendingSyncJournalEntriesDBManager();
