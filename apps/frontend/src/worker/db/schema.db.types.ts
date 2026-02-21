export interface StoredFile {
  fileId: string;
  pendingSyncId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  createdAt: number;
  status: "pending" | "in-progress" | "completed" | "failed";
  error?: string;
  errorCount: number;
  thumbnailBlob?: Blob | null;
  thumbnailStatus?: 'pending' | 'in-progress' | 'completed' | 'failed';
  cdnUrls?: [string, "not-available" | string] | null; // [originalUrl, thumbnailUrl]
  teamId?: string | null;
}

export type PendingAction = 'create' | 'update' | 'delete';

export interface SyncMetadata {
  tableName: string;
  cursorUpdatedAt: number;
  cursorId: string | null;
}

export interface SyncConflict {
  conflictId?: number; // Auto-increment
  tableName: string;
  recordId: string;
  localData: any;
  serverData: any;
  conflictedAt: number;
}

export interface JournalEntrySyncMetadata {
  status?: "file-upload-pending" | "file-upload-in-progress" | "file-upload-completed" | "file-upload-failed" | "syncing" | "synced" | "sync-failed";
  error?: string;
  errorCount?: number;
  attachmentFileIds?: string[];
}