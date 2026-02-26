import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";

export interface StoredFile extends FileSelectAll {
  _blob?: Blob;
  _thumbnailBlob?: Blob | null;
  _pendingAction?: PendingAction | null;
  _lastSyncAttemptAt?: number;
}

export type PendingAction = 'create' | 'update' | 'delete';

export interface SyncMetadata {
  tableName: string;
  cursorUpdatedAt: number;
  cursorId: string | null;
}

export interface JournalEntrySyncMetadata {
  _pendingAction?: PendingAction | null;
}