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
      clientUpdatedAt: entry.updatedAt, // Sync with server updatedAt
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
      clientUpdatedAt: entry.updatedAt,
    }));

    await clientDb.journalEntries.bulkPut(data);
    notifySubscribers("journalEntries");
  }

  /**
   * LOCAL Update (User edit)
   * Constraint: DO NOT change updatedAt. Update clientUpdatedAt only.
   */
  async handleLocalUpdate(id: string, updates: Partial<JournalEntrySelectAll>) {
    await clientDb.transaction("rw", clientDb.journalEntries, async () => {
      const existing = await clientDb.journalEntries.get(id);
      if (!existing) return;

      const updated: WithSync<JournalEntrySelectAll> = {
        ...existing,
        ...updates,
        _pendingAction: existing._pendingAction === 'create' ? 'create' : 'update',
        clientUpdatedAt: Date.now(),
      };

      await clientDb.journalEntries.put(updated);
    });
    notifySubscribers("journalEntries");
  }

  /**
   * LOCAL Create
   */
  async handleLocalCreate(entry: WithSync<JournalEntrySelectAll>) {
    const data: WithSync<JournalEntrySelectAll> = {
      ...entry,
      _pendingAction: 'create',
      clientUpdatedAt: Date.now(),
    };
    await clientDb.journalEntries.put(data);
    notifySubscribers("journalEntries");
  }

  async bulkDelete(journalEntryIds: string[]) {
    await clientDb.journalEntries.bulkDelete(journalEntryIds);
    notifySubscribers("journalEntries");
  }

  async delete(id: string) {
    await clientDb.transaction("rw", clientDb.journalEntries, async () => {
      const existing = await clientDb.journalEntries.get(id);
      if (existing) {
        if (existing._pendingAction === 'create') {
          // If never synced, just delete
          await clientDb.journalEntries.delete(id);
        } else {
          // Mark for deletion on server
          await clientDb.journalEntries.update(id, { 
            _pendingAction: 'delete',
            clientUpdatedAt: Date.now()
          });
        }
      }
    });
    notifySubscribers("journalEntries");
  }

  async getById(id: string) {
    return await clientDb.journalEntries.get(id);
  }

  async getAll(teamId: string | null = null) {
    const baseQuery = teamId 
      ? clientDb.journalEntries.where("teamId").equals(teamId)
      : clientDb.journalEntries.filter(e => !e.teamId);

    // Filter out items marked for deletion
    return await baseQuery
      .filter(e => e._pendingAction !== 'delete')
      .reverse()
      .toArray();
  }

  async getAllUnscoped() {
    return await clientDb.journalEntries.filter(e => e._pendingAction !== 'delete').reverse().toArray();
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
      return await clientDb.journalEntries.where("teamId").equals(teamId).filter(e => !!e._pendingAction && e._pendingAction !== 'delete').count();
    }
    return await clientDb.journalEntries.filter(e => !e.teamId && !!e._pendingAction && e._pendingAction !== 'delete').count();
  }

  async getPending(teamId: string | null = null) {
    if (teamId) {
      return await clientDb.journalEntries.where("teamId").equals(teamId).filter(e => !!e._pendingAction && e._pendingAction !== 'delete').reverse().toArray();
    }
    return await clientDb.journalEntries.filter(e => !e.teamId && !!e._pendingAction && e._pendingAction !== 'delete').reverse().toArray();
  }

  async wipeByTeamAppId(teamAppId: string) {
    console.warn(`[JournalEntriesDBManager] Wiping all entries for team ${teamAppId}`);
    await clientDb.journalEntries.where("teamId").equals(teamAppId).delete();
    notifySubscribers("journalEntries");
  }
}

export const journalEntriesDb = new JournalEntriesDBManager();
