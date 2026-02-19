import Dexie from "dexie";
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

  async delete(id: string) {
    await db.journalEntries.delete(id);
    notifySubscribers("journalEntries");
  }

  async getById(id: string) {
    return await db.journalEntries.get(id);
  }

  async getAll(teamId: string | null = null) {
    if (teamId) {
      return await db.journalEntries.where("teamId").equals(teamId).reverse().toArray();
    }
    return await db.journalEntries.filter(e => !e.teamId).reverse().toArray();
  }

  async getAllUnscoped() {
    return await db.journalEntries.reverse().toArray();
  }

  getPaginated(offset: number, limit: number, teamId: string | null = null) {
    if (teamId) {
      return db.journalEntries
        .where("[teamId+createdAt]")
        .between([teamId, Dexie.minKey], [teamId, Dexie.maxKey])
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray();
    }
    // For personal space (null teamId)
    // Using filter and reverse on the whole table is fine for local Dexie scale
    return db.journalEntries
      .toCollection()
      .filter(e => !e.teamId)
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray();
  }

  async getLatestUpdatedAt() {
    const latest = await db.journalEntries.orderBy("updatedAt").last();
    console.debug(`[JournalEntriesDBManager] Latest updatedAt: ${latest?.updatedAt}`);
    return latest;
  }

  async count(teamId: string | null = null) {
    if (teamId) {
      return await db.journalEntries.where("teamId").equals(teamId).count();
    }
    return await db.journalEntries.filter(e => !e.teamId).count();
  }

  async search(query: string, teamId: string | null = null) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return this.getAll(teamId);
    }

    const baseCollection = teamId
      ? db.journalEntries.where("teamId").equals(teamId)
      : db.journalEntries.toCollection().filter(e => !e.teamId);

    return await baseCollection
      .filter(entry => {
        const contentMatch = entry.content.toLowerCase().includes(lowerQuery);
        const promptMatch = entry.prompt?.toLowerCase().includes(lowerQuery);
        return contentMatch || promptMatch;
      })
      .reverse()
      .toArray();
  }

  async searchPaginated(query: string, offset: number, limit: number, teamId: string | null = null) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return this.getPaginated(offset, limit, teamId);
    }

    const baseCollection = teamId
      ? db.journalEntries.where("teamId").equals(teamId)
      : db.journalEntries.toCollection().filter(e => !e.teamId);

    return await baseCollection
      .filter(entry => {
        const contentMatch = entry.content.toLowerCase().includes(lowerQuery);
        const promptMatch = entry.prompt?.toLowerCase().includes(lowerQuery);
        return contentMatch || promptMatch;
      })
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray();
  }

  async searchCount(query: string, teamId: string | null = null) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return this.count(teamId);
    }

    const baseCollection = teamId
      ? db.journalEntries.where("teamId").equals(teamId)
      : db.journalEntries.toCollection().filter(e => !e.teamId);

    return await baseCollection
      .filter(entry => {
        const contentMatch = entry.content.toLowerCase().includes(lowerQuery);
        const promptMatch = entry.prompt?.toLowerCase().includes(lowerQuery);
        return contentMatch || promptMatch;
      })
      .count();
  }

  async wipeByTeamAppId(teamAppId: string) {
    console.warn(`[JournalEntriesDBManager] Wiping all entries for team ${teamAppId}`);
    await db.journalEntries.where("teamId").equals(teamAppId).delete();
    notifySubscribers("journalEntries");
  }
}

export const journalEntriesDb = new JournalEntriesDBManager();
