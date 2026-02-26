import { IdentifiedFile } from "./cdn.types";
import { CDNManager } from "./cdn.manager";

export interface MediaProcessingResult {
  thumbnailFile: File | null;
  error?: string;
}

export interface MediaUploadResult {
  success: boolean;
  urls: [string, string | null] | null;
  error?: string;
}

export class MediaUploadService {
  private cdnManager = new CDNManager();

  /**
   * Statelessly generates a thumbnail for a given file.
   */
  async generateThumbnail(file: File): Promise<MediaProcessingResult> {
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
  }

  /**
   * Performs the actual CDN upload for a single file.
   */
  async uploadSingleFile(file: IdentifiedFile): Promise<MediaUploadResult> {
    try {
      const results = await this.cdnManager.uploadFiles([file], "media");
      const result = results[0];

      if (result?.success) {
        return { 
          success: true, 
          urls: [result.url, null]
        };
      } else {
        return { success: false, urls: null, error: result?.error || "Upload failed" };
      }
    } catch (error) {
      return { 
        success: false, 
        urls: null, 
        error: error instanceof Error ? error.message : "Upload failed" 
      };
    }
  }
}

export const mediaUploadService = new MediaUploadService();
