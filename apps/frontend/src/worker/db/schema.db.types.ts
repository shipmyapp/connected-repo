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