import { IdentifiedFile } from "./cdn.types";
import { CDNManager } from "./cdn.manager";
import { pLimit } from "../../utils/promise.utils";

export interface MediaProcessingResult {
  thumbnailFile: File | null;
  error?: string;
}

export interface MediaUploadResult {
  success: boolean;
  cdnUrl: string | null;
  error?: string;
}

// Module-level semaphore to preserve resource limits across all instances 
// while avoiding Comlink proxying issues that occur with class properties.
const mediaWorkerSemaphore = pLimit(3);

export class MediaUploadService {
  private cdnManager = new CDNManager();

  /**
   * Statelessly generates a thumbnail for a given file.
   */
  async generateThumbnail(file: File): Promise<MediaProcessingResult> {
    return mediaWorkerSemaphore(async () => {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      const isVideo = file.type.startsWith("video/");

      if (!isImage && !isPdf && !isVideo) {
        return { thumbnailFile: null };
      }

      try {
        let thumbnailFile: File | null = null;

        if (isImage) {
          const { generateImageThumbnail } = await import("./utils/thumbnail-image");
          thumbnailFile = await generateImageThumbnail(file);
        } else if (isPdf) {
          const { generatePdfThumbnail } = await import("./utils/thumbnail-pdf");
          thumbnailFile = await generatePdfThumbnail(file);
        }

        return { thumbnailFile };
      } catch (error) {
        return { 
          thumbnailFile: null, 
          error: error instanceof Error ? error.message : "Thumbnail generation failed" 
        };
      }
    });
  }

  /**
   * Performs the actual CDN upload for a single file.
   */
  async uploadSingleFile(file: IdentifiedFile): Promise<MediaUploadResult> {
    const results = await this.uploadFiles([file]);
    return results[0]!;
  }

  /**
   * Performs the actual CDN upload for multiple files in batch.
   * Gets all presigned URLs in one go, then uploads with a concurrency limit.
   */
  async uploadFiles(files: IdentifiedFile[]): Promise<MediaUploadResult[]> {
    if (files.length === 0) return [];

    try {
      // 1. Get ALL presigned URLs in a single request (Batching)
      const presignedData = await this.cdnManager.getBatchPresignedUrls(files, "media");

      // 2. Upload them in parallel, but LIMITED by the semaphore (Resource safety)
      const uploadPromises = files.map((file, index) => {
        const presigned = presignedData[index]!;
        
        return mediaWorkerSemaphore(async () => {
          const result = await this.cdnManager.uploadToUrl(file, presigned);
          return {
            success: result.success,
            cdnUrl: result.success ? result.url : null,
            error: result.error,
          };
        });
      });

      return Promise.all(uploadPromises);
    } catch (error) {
      console.error("[MediaUploadService] Batch upload error:", error);
      const errorMsg = error instanceof Error ? error.message : "Batch upload failed";
      return files.map(() => ({
        success: false,
        cdnUrl: null,
        error: errorMsg,
      }));
    }
  }
}

export const mediaUploadService = new MediaUploadService();
