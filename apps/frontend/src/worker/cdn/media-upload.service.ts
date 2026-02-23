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
   * Performs the actual CDN upload for a pair of files.
   * Highly robust: handles missing thumbnails or partial failures.
   */
  async uploadMediaPair(original: File, thumbnail?: File): Promise<MediaUploadResult> {
    const filesToUpload: File[] = [original];
    if (thumbnail) filesToUpload.push(thumbnail);

    try {
      const results = await this.cdnManager.uploadFiles(filesToUpload, "media");
      
      const originalResult = results[0];
      const thumbnailResult = thumbnail ? results[1] : null;

      if (originalResult?.success) {
        return { 
          success: true, 
          urls: [originalResult.url, thumbnailResult?.url || null]
        };
      } else {
        return { success: false, urls: null, error: originalResult?.error || "Original upload failed" };
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
