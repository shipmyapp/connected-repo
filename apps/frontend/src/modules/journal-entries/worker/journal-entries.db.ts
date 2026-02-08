import { JournalEntrySelectAll, journalEntrySelectAllZod, pendingSyncJournalEntryZod, type PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import { db, notifySubscribers } from "../../../worker/db/db.manager";
import { filesDb } from "../../../worker/db/files.db";

export class JournalEntriesDBManager {
  async upsertJournalEntry(entry: JournalEntrySelectAll) {
    await db.journalEntries.put(journalEntrySelectAllZod.parse(entry));
    // When upserting a synced entry, check if it was previously a pending entry and remove it
    await this.removePendingSyncEntry(entry.journalEntryId);
    notifySubscribers("journalEntries");
  }

  async getAllJournalEntries() {
    return await db.journalEntries.orderBy("createdAt").reverse().toArray();
  }

  async addPendingSyncEntry(entry: PendingSyncJournalEntry) {
    await db.pendingSyncJournalEntries.add(pendingSyncJournalEntryZod.parse(entry));
    notifySubscribers("pendingSyncJournalEntries");
  }

  async getPendingSyncEntries() {
    return await db.pendingSyncJournalEntries.orderBy("createdAt").toArray();
  }

  async removePendingSyncEntry(id: string) {
    await db.pendingSyncJournalEntries.delete(id);
    // Also remove associated files via central filesDb
    await filesDb.deleteFilesByPendingSyncId(id);
    notifySubscribers("pendingSyncJournalEntries");
  }

  // File methods now delegated to centralized filesDb
  async storeFile(fileId: string, pendingSyncId: string, blob: Blob, fileName: string) {
    return await filesDb.storeFile(fileId, pendingSyncId, blob, fileName);
  }

  async getFile(fileId: string) {
    return await filesDb.getFile(fileId);
  }

  async getFilesForPendingSyncEntry(pendingSyncId: string) {
    return await filesDb.getFilesByPendingSyncId(pendingSyncId);
  }
}

export const journalEntriesDb = new JournalEntriesDBManager();
