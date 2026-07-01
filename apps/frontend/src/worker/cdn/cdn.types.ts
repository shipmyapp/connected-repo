export type FileProgressStage =
  | "pending"
  | "validating"
  | "compressing"
  | "getting-urls"
  | "uploading"
  | "success"
  | "completed"
  | "error";

/**
 * A user-supplied `File` paired with a stable `id` we generate on the main
 * thread. Plain object so it survives structured-cloning through Comlink
 * without relying on custom properties being preserved on host objects.
 */
export interface IdentifiedFile {
  id: string;
  file: File;
}

export interface FileProgress {
  fileName: string;
  progress: number;
  stage: FileProgressStage;
  error?: string;
}

export interface UploadProgress extends FileProgress {
  fileIndex: number;
  file: File;
  preview?: string;
  status: FileProgressStage;
}

export interface UploadResult {
  success: boolean;
  url: string;
  file: File;
  error?: string;
  thumbnailUrl?: string;
  type?: "Image" | "Video" | "Document";
}

export interface CDNProgressUpdate {
  fileProgress: FileProgress[];
}
