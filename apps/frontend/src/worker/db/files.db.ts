import { db, notifySubscribers } from "./db.manager";
import type { StoredFile } from "./schema.db.types";

export class FilesDBManager {
  /**
   * Stores a file blob in IndexedDB.
   */
  async upsert(fileId: string, pendingSyncId: string, blob: Blob, fileName: string, teamId: string | null = null) {
    await db.files.put({
      fileId,
      pendingSyncId,
      blob,
      fileName,
      mimeType: blob.type,
      createdAt: Date.now(),
      status: "pending",
      error: "",
      errorCount: 0,
      teamId,
    });
    notifySubscribers("files");
  }

  /**
   * Updates specific fields of a stored file.
   */
  async update(fileId: string, updates: Partial<StoredFile>) {
    await db.files.update(fileId, updates);
    notifySubscribers("files");
  }

  /**
   * Retrieves a file from storage.
   */
  get(fileId: string) {
    return db.files.get(fileId);
  }

  /**
   * Retrieves all files with a 'pending' status.
   */
  async getPendingFiles() {
    return await db.files.where("status").equals("pending").toArray();
  }

  /**
   * Retrieves all files linked to a specific pending sync entry.
   */
  getFilesByPendingSyncId(pendingSyncId: string) {
    return db.files.where("pendingSyncId").equals(pendingSyncId).toArray();
  }

  /**
   * Deletes all files linked to a specific pending sync entry.
   */
  async deleteFilesByPendingSyncId(pendingSyncId: string) {
    await db.files.where("pendingSyncId").equals(pendingSyncId).delete();
    notifySubscribers("files");
  }

  async bulkDeleteFilesByPendingSyncIds(pendingSyncIds: string[]) {
    await db.files.where("pendingSyncId").anyOf(pendingSyncIds).delete();
    notifySubscribers("files");
  }
}

export const filesDb = new FilesDBManager();
