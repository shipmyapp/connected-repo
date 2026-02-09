import { pendingSyncJournalEntryZod, type PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import { db, notifySubscribers } from "./db.manager";
import { filesDb } from "./files.db";
import Dexie from "dexie";

export class PendingSyncJournalEntriesDBManager {
  async add(entry: PendingSyncJournalEntry) {
    await db.pendingSyncJournalEntries.add(pendingSyncJournalEntryZod.parse(entry));
    notifySubscribers("pendingSyncJournalEntries");
  }

  async get(id: string) {
    return await db.pendingSyncJournalEntries.get(id);
  }

  async getAll(teamId?: string | null) {
    const filterId = teamId === "personal" ? null : teamId;
    if (filterId === undefined) {
      return await db.pendingSyncJournalEntries.orderBy("createdAt").reverse().toArray();
    }
    return await db.pendingSyncJournalEntries.where("[teamId+createdAt]").between([filterId, Dexie.minKey], [filterId, Dexie.maxKey]).reverse().toArray();
  }

  async getPaginated(offset: number, limit: number, teamId?: string | null) {
    const filterId = teamId === "personal" ? null : teamId;
    if (filterId === undefined) {
      return await db.pendingSyncJournalEntries.orderBy("createdAt").reverse().offset(offset).limit(limit).toArray();
    }
    return await db.pendingSyncJournalEntries.where("[teamId+createdAt]").between([filterId, Dexie.minKey], [filterId, Dexie.maxKey]).reverse().offset(offset).limit(limit).toArray();
  }

  async count(teamId?: string | null) {
    const filterId = teamId === "personal" ? null : teamId;
    if (filterId === undefined) {
      return await db.pendingSyncJournalEntries.count();
    }
    return await db.pendingSyncJournalEntries.where({ teamId: filterId }).count();
  }

  async updateStatus(id: string, status: PendingSyncJournalEntry['status'], error?: string) {
    const entry = await this.get(id);
    await db.pendingSyncJournalEntries.update(id, {
      status,
      error,
      errorCount: error ? (entry?.errorCount ?? 0) + 1 : entry?.errorCount ?? 0
    });
    notifySubscribers("pendingSyncJournalEntries");
  }

  async delete(id: string) {
    await db.transaction("rw", [db.pendingSyncJournalEntries, db.files], async () => {
      await db.pendingSyncJournalEntries.delete(id);
      // Also remove associated files via central filesDb
      await filesDb.deleteFilesByPendingSyncId(id);
    });
    notifySubscribers("pendingSyncJournalEntries");
  }

  async bulkDelete(ids: string[]) {
    await db.transaction("rw", [db.pendingSyncJournalEntries, db.files], async () => {
      await db.pendingSyncJournalEntries.bulkDelete(ids);
      // Also remove associated files
      await filesDb.bulkDeleteFilesByPendingSyncIds(ids);
    });
    notifySubscribers("pendingSyncJournalEntries");
  }
}

export const pendingSyncJournalEntriesDb = new PendingSyncJournalEntriesDBManager();
