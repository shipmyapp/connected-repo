import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";

export interface StoredFile extends FileSelectAll {
  _blob?: Blob;
  _uploadStatus?: "pending" | "in-progress" | "completed" | "failed";
  _thumbnailStatus?: "pending" | "in-progress" | "completed" | "failed";
  _syncStatus?: "pending" | "in-progress" | "completed" | "failed";
  _error?: string;
  _errorCount?: number;
  _thumbnailBlob?: Blob | null;
  _pendingAction?: PendingAction | null;
}

export type PendingAction = 'create' | 'update' | 'delete';

export interface SyncMetadata {
  tableName: string;
  cursorUpdatedAt: number;
  cursorId: string | null;
}


export interface JournalEntrySyncMetadata {
  status?: "file-upload-pending" | "file-upload-in-progress" | "file-upload-completed" | "file-upload-failed" | "syncing" | "synced" | "sync-failed";
  error?: string;
  errorCount?: number;
  attachmentFileIds?: string[];
}