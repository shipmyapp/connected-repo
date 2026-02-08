import { filesDb } from "../db/files.db";
import { CDNManager } from "./cdn.manager";
import imageCompression from "browser-image-compression";

export interface ProcessedUploadResult {
  success: boolean;
  originalUrl: string;
  thumbnailUrl: string;
  error?: string;
}

export class MediaUploadService {
  private cdnManager = new CDNManager();

  /**
   * Retrieves a file from IndexedDB and converts it to a standard File object.
   */
  private async getStoredFile(fileId: string): Promise<File | null> {
    const storedFile = await filesDb.getFile(fileId);
    if (!storedFile) return null;

    return new File([storedFile.blob], storedFile.fileName, {
      type: storedFile.mimeType,
    });
  }

  /**
   * Compresses an image file, returning a thumbnail version.
   * Returns null if compression fails or if file is not an image.
   */
  private async compressImage(file: File): Promise<File | null> {
    if (!file.type.startsWith("image/")) return null;

    try {
      const options = {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1200,
        useWebWorker: false, // We ARE already in a web worker
        initialQuality: 0.8,
      };

      const compressedBlob = await imageCompression(file, options);
      return new File([compressedBlob], `thumb_${file.name}`, {
        type: compressedBlob.type,
      });
    } catch (error) {
      console.warn("[MediaUploadService] Image compression failed:", error);
      return null;
    }
  }

  /**
   * Orchestrates the full process: Retrieve -> Optional Compress -> Batch Upload.
   */
  async processAndUploadById(fileId: string): Promise<ProcessedUploadResult> {
    try {
      // 1. Get the original file
      const originalFile = await this.getStoredFile(fileId);
      if (!originalFile) {
        return { success: false, originalUrl: "", thumbnailUrl: "", error: "File not found" };
      }

      // 2. Prepare files for batch upload
      const filesToUpload: File[] = [originalFile];
      
      const thumbnailFile = await this.compressImage(originalFile);
      if (thumbnailFile) {
        filesToUpload.push(thumbnailFile);
      }

      // 3. Batch upload to CDN
      const uploadResults = await this.cdnManager.uploadFiles(filesToUpload, "media");

      // 4. Map results to URLs
      const originalResult = uploadResults[0];
      const thumbnailResult = uploadResults[1] || originalResult; // Fallback to original if no thumbnail was uploaded

      if (!originalResult?.success) {
        return {
          success: false,
          originalUrl: "",
          thumbnailUrl: "",
          error: originalResult?.error || "Upload failed",
        };
      }

      return {
        success: true,
        originalUrl: originalResult.url,
        thumbnailUrl: thumbnailResult?.success ? thumbnailResult.url : originalResult.url,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Media processing aborted";
      console.error("[MediaUploadService] Critical failure:", error);
      return { success: false, originalUrl: "", thumbnailUrl: "", error: errorMsg };
    }
  }
}

export const mediaUploadService = new MediaUploadService();
