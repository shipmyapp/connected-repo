import imageCompression from "browser-image-compression";
import { filesDb } from "../db/files.db";
import { CDNManager } from "./cdn.manager";

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
    const storedFile = await filesDb.get(fileId);
    if (!storedFile) return null;

    return new File([storedFile.blob], storedFile.fileName, {
      type: storedFile.mimeType,
    });
  }

  /**
   * Compresses an image file, returning a thumbnail version.
   * Returns null if compression fails or if file is not an image.
   */
  private async compressImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/")) throw new Error("File is not an image");

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
      throw error;
    }
  }

  /**
   * Helper to increment error count and update status
   */
  private async handleError(fileId: string, error: unknown, type: 'thumbnail' | 'upload') {
    const file = await filesDb.get(fileId);
    if (!file) return;

    const newErrorCount = (file.errorCount ?? 0) + 1;
    const errorMsg = error instanceof Error ? error.message : String(error);

    const update: any = {
      error: errorMsg,
      errorCount: newErrorCount,
    };

    if (type === 'thumbnail') {
      update.thumbnailStatus = 'failed';
    } else {
      update.status = 'failed';
    }

    await filesDb.update(fileId, update);
    console.warn(`[MediaUploadService] ${type} failed for ${fileId} (Count: ${newErrorCount}):`, errorMsg);
  }

  /**
   * Generates a thumbnail for a given file and stores it in FilesDB.
   */
  async generateAndStoreThumbnail(fileId: string): Promise<void> {
    const file = await filesDb.get(fileId);
    if (!file || !file.mimeType.startsWith("image/") || file.thumbnailStatus === 'completed') {
      if (file && !file.mimeType.startsWith("image/")) {
        await filesDb.update(fileId, { thumbnailStatus: 'completed' });
      }
      return;
    }

    try {
      await filesDb.update(fileId, { thumbnailStatus: 'in-progress' });
      const originalFile = new File([file.blob], file.fileName, { type: file.mimeType });
      // TODO: Implement thumbnail for pdf files
      // TODO: Implement thumbail for videos
      const thumbnailFile = await this.compressImage(originalFile);
      
      await filesDb.update(fileId, {
        thumbnailBlob: thumbnailFile,
        thumbnailStatus: 'completed'
      });
      console.debug(`[MediaUploadService] Generated thumbnail for ${fileId}`);
    } catch (error) {
      await this.handleError(fileId, error, 'thumbnail');
    }
  }

  /**
   * Uploads both original and thumbnail to CDN.
   * Returns a tuple [originalUrl, thumbnailUrl].
   */
  async uploadMediaPair(fileId: string): Promise<[string, string] | null> {
    const file = await filesDb.get(fileId);
    if (!file) return null;

    if (file.cdnUrls) return file.cdnUrls;

    const filesToUpload: File[] = [];
    const originalFile = new File([file.blob], file.fileName, { type: file.mimeType });
    filesToUpload.push(originalFile);

    if (file.thumbnailBlob) {
      const thumbnailFile = new File([file.thumbnailBlob], `thumb_${file.fileName}`, { type: file.thumbnailBlob.type });
      filesToUpload.push(thumbnailFile);
    }

    try {
      await filesDb.update(fileId, { status: 'in-progress' });
      const results = await this.cdnManager.uploadFiles(filesToUpload, "media");
      
      const originalResult = results[0];
      const thumbnailResult = results[1] || originalResult; // Fallback to original if no thumbnail exists

      if (originalResult?.success) {
        const cdnUrls: [string, string] = [originalResult.url, (thumbnailResult?.success ? thumbnailResult.url : originalResult.url)];
        await filesDb.update(fileId, {
          cdnUrls,
          status: 'completed'
        });
        return cdnUrls;
      } else {
        throw new Error(originalResult?.error || "Upload failed");
      }
    } catch (error) {
      await this.handleError(fileId, error, 'upload');
      return null;
    }
  }

  /**
   * Orchestrates the full process: Retrieve -> Optional Compress -> Batch Upload.
   * Kept for backward compatibility.
   */
  async processAndUploadById(fileId: string): Promise<ProcessedUploadResult> {
    const urls = await this.uploadMediaPair(fileId);
    if (!urls) return { success: false, originalUrl: "", thumbnailUrl: "", error: "Upload failed" };
    return { success: true, originalUrl: urls[0], thumbnailUrl: urls[1] };
  }
}

export const mediaUploadService = new MediaUploadService();
