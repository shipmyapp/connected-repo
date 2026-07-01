import { pLimit } from "../../utils/promise.utils";
import { CDNManager } from "./cdn.manager";
import type { IdentifiedFile } from "./cdn.types";

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
// while avoiding Comlink proxying issues with class properties.
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
          error: error instanceof Error ? error.message : "Thumbnail generation failed",
        };
      }
    });
  }

  /**
   * Uploads a single file to the CDN via a presigned URL.
   */
  async uploadSingleFile(item: IdentifiedFile): Promise<MediaUploadResult> {
    const [result] = await this.uploadFiles([item]);
    return result ?? { success: false, cdnUrl: null, error: "Empty upload result" };
  }

  /**
   * Performs the actual CDN upload for multiple files in batch.
   * Fetches all presigned URLs in one request, then uploads with a concurrency limit.
   */
  async uploadFiles(items: IdentifiedFile[]): Promise<MediaUploadResult[]> {
    if (items.length === 0) return [];

    try {
      const presignedData = await this.cdnManager.getBatchPresignedUrls(items, "media");

      const uploadPromises = items.map((item, index) => {
        const presigned = presignedData[index];
        if (!presigned) {
          return Promise.resolve({
            success: false,
            cdnUrl: null,
            error: "No presigned URL returned for file",
          });
        }

        return mediaWorkerSemaphore(async () => {
          const result = await this.cdnManager.uploadToUrl(item.file, presigned);
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
      return items.map(() => ({
        success: false,
        cdnUrl: null,
        error: errorMsg,
      }));
    }
  }
}

export const mediaUploadService = new MediaUploadService();
