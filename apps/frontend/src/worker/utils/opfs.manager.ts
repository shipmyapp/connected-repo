/**
 * Utility for managing files in the Origin Private File System (OPFS).
 * Provides a sandboxed file system for storing binary blobs outside of IndexedDB.
 */
import { logOfflineError } from "../../utils/offline_errors.client";
export class OPFSManager {
  private static rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

  private static getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.rootPromise) {
      this.rootPromise = navigator.storage.getDirectory();
    }
    return this.rootPromise;
  }

  /**
   * Saves a Blob to OPFS at the specified path (relative to root).
   */
  static async saveFile(path: string, blob: Blob): Promise<void> {
    const root = await this.getRoot();
    const parts = path.split('/');
    const fileName = parts.pop()!;
    
    let currentDir = root;
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }

    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  /**
   * Reads a File as a Blob from OPFS at the specified path.
   */
  static async readFile(path: string): Promise<Blob | null> {
    try {
      const root = await this.getRoot();
      const parts = path.split('/');
      const fileName = parts.pop()!;
      
      let currentDir = root;
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part);
      }

      const fileHandle = await currentDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return file;
    } catch (error) {
      console.warn(`[OPFS] Failed to read file at ${path}:`, error);
      logOfflineError(error, "OPFSManager:readFile");
      return null;
    }
  }

  /**
   * Deletes a file from OPFS at the specified path.
   */
  static async deleteFile(path: string): Promise<void> {
    try {
      const root = await this.getRoot();
      const parts = path.split('/');
      const fileName = parts.pop()!;
      
      let currentDir = root;
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part);
      }

      await currentDir.removeEntry(fileName);
    } catch (error) {
      console.warn(`[OPFS] Failed to delete file at ${path}:`, error);
      logOfflineError(error, "OPFSManager:deleteFile");
    }
  }

  /**
   * Calculates SHA-256 checksum for a Blob.
   */
  static async calculateChecksum(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
