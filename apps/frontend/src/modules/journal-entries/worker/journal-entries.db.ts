import Dexie from "dexie";
import { JournalEntrySelectAll, journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { clientDb, notifySubscribers, type WithSync } from "../../../worker/db/db.manager";

export class JournalEntriesDBManager {
  /**
   * Upsert from SERVER (SSE or API response)
   */
  async upsert(entry: JournalEntrySelectAll) {
    const data: WithSync<JournalEntrySelectAll> = {
      ...journalEntrySelectAllZod.parse(entry),
      _pendingAction: null,
    };
    
    await clientDb.journalEntries.put(data);
    notifySubscribers("journalEntries");
  }

  /**
   * Bulk upsert from SERVER (Delta sync)
   */
  async bulkUpsert(entries: JournalEntrySelectAll[]) {
    if (entries.length === 0) return;
    
    const data: WithSync<JournalEntrySelectAll>[] = entries.map(entry => ({
      ...entry,
      _pendingAction: null,
    }));

    await clientDb.journalEntries.bulkPut(data);
    notifySubscribers("journalEntries");
  }

  /**
   * LOCAL Update (User edit)
   * Enforces Online-Only for synced records.
   */
  async handleLocalUpdate(id: string, updates: Partial<JournalEntrySelectAll>) {
    const existing = await clientDb.journalEntries.get(id);
    if (!existing) {
      throw new Error(`Entry with id ${id} not found.`);
    }

    // If it's a new unsynced record, we allow offline-first logic
    if (existing._pendingAction === 'create') {
      await clientDb.transaction("rw", clientDb.journalEntries, async () => {
        const updated: WithSync<JournalEntrySelectAll> = {
          ...existing,
          ...updates,
          _pendingAction: 'create',
        };
        await clientDb.journalEntries.put(updated);
      });
      notifySubscribers("journalEntries");
      return;
    }

    // For already-synced records, we MUST be online
    if (!navigator.onLine) {
      throw new Error("Offline: Edits to synced entries require an internet connection.");
    }

    try {
      // 1. Immediate API Call
      const orpcFetch = (await import("../../../utils/orpc.client")).orpcFetch;
      const result = await orpcFetch.journalEntries.update({
        ...existing,
        ...updates
      });

      // 2. Local Update on Success
      await clientDb.transaction("rw", clientDb.journalEntries, async () => {
        const data: WithSync<JournalEntrySelectAll> = {
          ...result,
          _pendingAction: null,
        };
        await clientDb.journalEntries.put(data);
      });
      notifySubscribers("journalEntries");
    } catch (err) {
      console.error("[JournalEntriesDB] Online update failed:", err);
      throw err;
    }
  }

  /**
   * LOCAL Create
   */
  async handleLocalCreate(entry: WithSync<JournalEntrySelectAll>) {
    const data: WithSync<JournalEntrySelectAll> = {
      ...entry,
      _pendingAction: 'create',
    };
    await clientDb.journalEntries.put(data);
    notifySubscribers("journalEntries");
  }

  async bulkDelete(ids: string[]) {
    await clientDb.journalEntries.bulkDelete(ids);
    notifySubscribers("journalEntries");
  }

  /**
   * LOCAL Delete
   * Enforces Online-Only for synced records.
   */
  async delete(id: string) {
    const existing = await clientDb.journalEntries.get(id);
    if (!existing) {
      throw new Error(`Entry with id ${id} not found.`);
    }

    // If never synced (pending create), just delete locally immediately
    if (existing._pendingAction === 'create') {
      await clientDb.journalEntries.delete(id);
      notifySubscribers("journalEntries");
      return;
    }

    // For already-synced records, we MUST be online to delete
    if (!navigator.onLine) {
      throw new Error("Offline: Deleting synced entries requires an internet connection.");
    }

    try {
      // 1. Immediate API Call to server
      const orpcFetch = (await import("../../../utils/orpc.client")).orpcFetch;
      await orpcFetch.journalEntries.delete({ 
        id: id,
        teamId: existing.teamId || undefined 
      });

      // 2. Local Delete on server success
      // No special modelling required - just delete the entry
      await clientDb.journalEntries.delete(id);
      notifySubscribers("journalEntries");
    } catch (err) {
      console.error("[JournalEntriesDB] Online delete failed:", err);
      throw err;
    }
  }

  async getById(id: string) {
    return await clientDb.journalEntries.get(id);
  }

  async getAll(teamId: string | null = null) {
    const baseQuery = teamId 
      ? clientDb.journalEntries.where("teamId").equals(teamId)
      : clientDb.journalEntries.filter(e => !e.teamId);

    // Simplified query as items are no longer marked for deletion
    return await baseQuery
      .reverse()
      .toArray();
  }

  async getAllUnscoped() {
    return await clientDb.journalEntries.reverse().toArray();
  }

  async getPaginated(offset: number, limit: number, teamId: string | null = null) {
    if (teamId) {
      return clientDb.journalEntries
        .where("[teamId+createdAt]")
        .between([teamId, Dexie.minKey], [teamId, Dexie.maxKey])
        .filter(e => e._pendingAction === null)
        .reverse()
        .offset(offset)
        .limit(limit)
        .toArray();
    }
    return clientDb.journalEntries
      .toCollection()
      .filter(e => !e.teamId && e._pendingAction === null)
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray();
  }

  async getLatestUpdatedAt() {
    const latest = await clientDb.journalEntries.orderBy("updatedAt").last();
    return latest;
  }

  async count(teamId: string | null = null) {
    if (teamId) {
      return await clientDb.journalEntries.where("teamId").equals(teamId).filter(e => e._pendingAction === null).count();
    }
    return await clientDb.journalEntries.filter(e => !e.teamId && e._pendingAction === null).count();
  }

  async countPending(teamId: string | null = null) {
    if (teamId) {
      return await clientDb.journalEntries.where("teamId").equals(teamId).filter(e => !!e._pendingAction).count();
    }
    return await clientDb.journalEntries.filter(e => !e.teamId && !!e._pendingAction).count();
  }

  async getPending(teamId: string | null = null) {
    if (teamId) {
      return await clientDb.journalEntries.where("teamId").equals(teamId).filter(e => !!e._pendingAction).reverse().toArray();
    }
    return await clientDb.journalEntries.filter(e => !e.teamId && !!e._pendingAction).reverse().toArray();
  }

  async wipeByTeamAppId(teamAppId: string) {
    console.warn(`[JournalEntriesDBManager] Wiping all entries for team ${teamAppId}`);
    await clientDb.journalEntries.where("teamId").equals(teamAppId).delete();
    notifySubscribers("journalEntries");
  }
}

export const journalEntriesDb = new JournalEntriesDBManager();
