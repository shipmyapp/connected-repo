import { clientDb, notifySubscribers } from "./db.manager";
import type { StoredFile } from "./schema.db.types";

export class FilesDBManager {
  /**
   * Stores a file blob in IndexedDB for local use/sync.
   */
  async upsertLocal(file: Omit<StoredFile, '_uploadStatus' | '_thumbnailStatus' | '_syncStatus' | '_error' | '_errorCount'>) {
    await clientDb.files.put({
      ...file,
      _uploadStatus: "pending",
      _thumbnailStatus: "pending",
      _syncStatus: "pending",
      _error: "",
      _errorCount: 0,
    } as StoredFile);
    notifySubscribers("files");
  }

  /**
   * Bulk upsert for sync from backend.
   */
  async bulkUpsert(files: any[]) {
    await clientDb.files.bulkPut(files);
    notifySubscribers("files");
  }

  /**
   * Updates specific fields of a stored file.
   */
  async update(id: string, updates: Partial<StoredFile>) {
    await clientDb.files.update(id, updates);
    notifySubscribers("files");
  }

  /**
   * Retrieves a file from storage.
   */
  get(id: string) {
    return clientDb.files.get(id);
  }

  /**
   * Retrieves all files with a 'pending' status.
   */
  async getPendingActions() {
    return await clientDb.files.filter(f => f._pendingAction !== null && f._pendingAction !== undefined).toArray();
  }

  async getUploadPendingFiles() {
    return await clientDb.files.where("_uploadStatus").equals("pending").toArray();
  }

  /**
   * Retrieves all files linked to a specific table record.
   */
  getFilesByTableId(tableId?: string) {
    if (!tableId) return [];
    return clientDb.files.where("tableId").equals(tableId).toArray();
  }

  /**
   * Retrieves all files linked to any of the provided table record IDs.
   */
  async getFilesByTableIds(tableIds: string[]) {
    if (tableIds.length === 0) return [];
    return clientDb.files.where("tableId").anyOf(tableIds).toArray();
  }

  /**
   * Deletes all files linked to a specific table record.
   */
  async deleteFilesByTableId(tableId: string) {
    await clientDb.files.where("tableId").equals(tableId).delete();
    notifySubscribers("files");
  }

  async bulkDelete(ids: string[]) {
    await clientDb.files.bulkDelete(ids);
    notifySubscribers("files");
  }

  async getAll(teamId?: string | null) {
    if (teamId === undefined) return clientDb.files.toArray();
    return clientDb.files.where("teamId").equals(teamId || "").toArray();
  }
}

export const filesDb = new FilesDBManager();
