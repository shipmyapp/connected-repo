import { clientDb, notifySubscribers } from "./db.manager";
import type { StoredFile } from "./schema.db.types";
import { OPFSManager } from "../utils/opfs.manager";

export class FilesDBManager {
  /**
   * Stores a file blob in IndexedDB for local use/sync.
   * Large blobs are moved to OPFS for durability.
   */
  async upsertLocal(file: StoredFile) {
    // 1. Handle main blob
    if (file._blob) {
      const checksum = await OPFSManager.calculateChecksum(file._blob);
      const extension = file.fileName?.split('.').pop() || 'bin';
      const opfsPath = `files/${file.id}/original.${extension}`;
      await OPFSManager.saveFile(opfsPath, file._blob);
      
      file._checksum = checksum;
      file._opfsPath = opfsPath;
      // We keep file._blob for the immediate sync/UX but it won't be in the DB after retrieval if we clear it here.
      // However, Dexie will store what's in the object. If we want to save space in IDB, we should delete it from the object before put().
      delete file._blob;
    }

    // 2. Handle thumbnail blob
    if (file._thumbnailBlob) {
      const thumbChecksum = await OPFSManager.calculateChecksum(file._thumbnailBlob);
      const thumbOpfsPath = `files/${file.id}/thumbnail.jpg`;
      await OPFSManager.saveFile(thumbOpfsPath, file._thumbnailBlob);

      file._thumbnailChecksum = thumbChecksum;
      file._thumbnailOpfsPath = thumbOpfsPath;
      delete file._thumbnailBlob;
    }

    await clientDb.files.put(file);
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
   * Retrieves a file from storage, pulling from OPFS if necessary.
   */
  async get(id: string): Promise<StoredFile | undefined> {
    const file = await clientDb.files.get(id);
    if (!file) return undefined;

    // Hydrate from OPFS if path is present and blob is missing
    if (file._opfsPath && !file._blob) {
      file._blob = (await OPFSManager.readFile(file._opfsPath)) || undefined;
    }

    if (file._thumbnailOpfsPath && !file._thumbnailBlob) {
      file._thumbnailBlob = await OPFSManager.readFile(file._thumbnailOpfsPath);
    }

    return file;
  }

  /**
   * Retrieves all files with a 'pending' status.
   */
  getPendingActions() {
    return clientDb.files.filter(f => f._pendingAction !== null && f._pendingAction !== undefined).toArray();
  }

  getSyncPendingFiles() {
    return clientDb.files.filter(f => f._pendingAction === 'create' || !f.cdnUrl).toArray();
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
  getFilesByTableIds(tableIds: string[]) {
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

  /**
   * Identify and flag file records that are marked for creation but are missing their binary blob.
   * This allows the SyncOrchestrator to attempt recovery or notify the user.
   */
  async handleOrphanedFiles() {
    const orphans = await clientDb.files
      .filter(f => f._pendingAction === 'create' && (!f._blob || f._blob.size === 0) && !f._syncError)
      .toArray();

    if (orphans.length > 0) {
      const ids = orphans.map(o => o.id);
      console.warn(`[FilesDBManager] Flagging ${ids.length} orphaned records missing blobs for recovery check:`, ids);
      // We don't delete anymore, we let the SyncOrchestrator handle the recovery attempt
      notifySubscribers("files");
    }
  }

  getAll(teamId?: string | null) {
    if (teamId === undefined) return clientDb.files.toArray();
    return clientDb.files.where("teamId").equals(teamId || "").toArray();
  }
}

export const filesDb = new FilesDBManager();
