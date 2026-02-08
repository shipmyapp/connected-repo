import { JournalEntrySelectAll, journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { pendingSyncJournalEntriesDb } from "@frontend/worker/db/pending-sync-journal-entries.db";
import { db, notifySubscribers } from "../../../worker/db/db.manager";

export class JournalEntriesDBManager {
  async upsert(entry: JournalEntrySelectAll) {
    await db.journalEntries.put(journalEntrySelectAllZod.parse(entry));
    // When upserting a synced entry, check if it was previously a pending entry and remove it
    await pendingSyncJournalEntriesDb.delete(entry.journalEntryId);
    notifySubscribers("journalEntries");
  }

  async bulkUpsert(entries: JournalEntrySelectAll[]) {
    await db.journalEntries.bulkPut(entries);
    notifySubscribers("journalEntries");
  }

  async bulkDelete(journalEntryIds: string[]) {
    await db.journalEntries.bulkDelete(journalEntryIds);
    notifySubscribers("journalEntries");
  }

  getAll() {
    return db.journalEntries.orderBy("createdAt").reverse().toArray();
  }

  getLatestUpdatedAt() {
    return db.journalEntries.orderBy("updatedAt").reverse().first();
  }
}

export const journalEntriesDb = new JournalEntriesDBManager();
