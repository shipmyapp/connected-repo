import { JournalEntrySelectAll, journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { pendingSyncJournalEntriesDb } from "@frontend/worker/db/pending-sync-journal-entries.db";
import { db, notifySubscribers } from "../../../worker/db/db.manager";

export class JournalEntriesDBManager {
  async upsert(entry: JournalEntrySelectAll) {
    await db.transaction("rw", [db.journalEntries, db.pendingSyncJournalEntries, db.files], async () => {
      await db.journalEntries.put(journalEntrySelectAllZod.parse(entry));
      // When upserting a synced entry, check if it was previously a pending entry and remove it
      console.debug(`[JournalEntriesDBManager] Upserting synced entry ${entry.journalEntryId}, clearing pending.`);
      await pendingSyncJournalEntriesDb.delete(entry.journalEntryId);
    });
    notifySubscribers("journalEntries");
  }

  async bulkUpsert(entries: JournalEntrySelectAll[]) {
    if (entries.length === 0) return;
    
    await db.transaction("rw", [db.journalEntries, db.pendingSyncJournalEntries, db.files], async () => {
      console.info(`[JournalEntriesDBManager] Bulk upserting ${entries.length} synced entries.`);
      await db.journalEntries.bulkPut(entries);
      const ids = entries.map(e => e.journalEntryId);
      await pendingSyncJournalEntriesDb.bulkDelete(ids);
    });
    notifySubscribers("journalEntries");
  }

  async bulkDelete(journalEntryIds: string[]) {
    await db.journalEntries.bulkDelete(journalEntryIds);
    notifySubscribers("journalEntries");
  }

  async getById(id: string) {
    return await db.journalEntries.get(id);
  }

  getAll() {
    return db.journalEntries.orderBy("createdAt").reverse().toArray();
  }

  async getLatestUpdatedAt() {
    const latest = await db.journalEntries.orderBy("updatedAt").last();
    console.debug(`[JournalEntriesDBManager] Latest updatedAt: ${latest?.updatedAt}`);
    return latest;
  }
}

export const journalEntriesDb = new JournalEntriesDBManager();
