import { pLimit } from "../../utils/promise.utils";

export interface MediaProcessingResult {
  thumbnailFile: File | null;
  error?: string;
}

// Module-level semaphore to preserve resource limits across all instances
// while avoiding Comlink proxying issues with class properties.
const mediaWorkerSemaphore = pLimit(3);

/**
 * Thumbnail-generation helper exposed through the MediaWorker's Comlink
 * proxy. The former `uploadFiles` / `uploadSingleFile` surface was
 * retired — the sole live upload path is now
 * `worker/sync/file_upload.worker.ts` (OPFS-backed, retry-aware). Any UI
 * that still needs a local preview should call `generateThumbnail`
 * directly; the same helper is invoked by `FileUploadWorker` when it
 * lazily derives the thumbnail from the OPFS blob at upload time.
 */
export class MediaUploadService {
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
}

export const mediaUploadService = new MediaUploadService();
