import Dexie from "dexie";
import { pendingSyncJournalEntryZod, type PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import { db, notifySubscribers } from "./db.manager";
import { filesDb } from "./files.db";

export class PendingSyncJournalEntriesDBManager {
  async add(entry: PendingSyncJournalEntry) {
    await db.pendingSyncJournalEntries.add(pendingSyncJournalEntryZod.parse(entry));
    notifySubscribers("pendingSyncJournalEntries");
  }

  async get(id: string) {
    return await db.pendingSyncJournalEntries.get(id);
  }

  async getAll(teamId: string | null = null) {
    if (teamId) {
      return await db.pendingSyncJournalEntries.where("teamId").equals(teamId).reverse().toArray();
    }
    return await db.pendingSyncJournalEntries.filter(e => !e.teamId).reverse().toArray();
  }

  async getAllUnscoped() {
    return await db.pendingSyncJournalEntries.toArray();
  }

  async getPaginated(offset: number, limit: number, teamId: string | null = null) {
    if (teamId) {
      return await db.pendingSyncJournalEntries
        .where("[teamId+createdAt]")
        .between([teamId, Dexie.minKey], [teamId, Dexie.maxKey])
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray();
    }
    // Personal space
    return await db.pendingSyncJournalEntries
      .toCollection()
      .filter(e => !e.teamId)
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray();
  }

  async count(teamId: string | null = null) {
    if (teamId) {
      return await db.pendingSyncJournalEntries.where("teamId").equals(teamId).count();
    }
    return await db.pendingSyncJournalEntries.filter(e => !e.teamId).count();
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

  async wipeByTeamAppId(teamAppId: string) {
    console.warn(`[PendingSyncJournalEntriesDBManager] Wiping all pending entries for team ${teamAppId}`);
    const entries = await db.pendingSyncJournalEntries.where("teamId").equals(teamAppId).toArray();
    const ids = entries.map(e => e.journalEntryId);
    if (ids.length > 0) {
      await this.bulkDelete(ids);
    }
  }
}

export const pendingSyncJournalEntriesDb = new PendingSyncJournalEntriesDBManager();
