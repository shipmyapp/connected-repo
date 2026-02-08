import { db, notifySubscribers } from "./db.manager";

export class FilesDBManager {
  /**
   * Stores a file blob in IndexedDB.
   */
  async upsert(fileId: string, pendingSyncId: string, blob: Blob, fileName: string) {
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
    });
    notifySubscribers("files");
  }

  /**
   * Retrieves a file from storage.
   */
  get(fileId: string) {
    return db.files.get(fileId);
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
}

export const filesDb = new FilesDBManager();
