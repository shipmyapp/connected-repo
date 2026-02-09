export type FileProgressStage = 
  | "pending" 
  | "validating" 
  | "compressing" 
  | "getting-urls" 
  | "uploading" 
  | "success"
  | "completed" 
  | "error";

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
