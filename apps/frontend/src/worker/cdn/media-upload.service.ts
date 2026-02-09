import imageCompression from "browser-image-compression";
import { CDNManager } from "./cdn.manager";
// @ts-ignore - Vite handled URL import for localized worker
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface MediaProcessingResult {
  thumbnailFile: File | null;
  error?: string;
}

export interface MediaUploadResult {
  success: boolean;
  urls: [string, "not-available" | string] | null;
  error?: string;
}

export class MediaUploadService {
  private cdnManager = new CDNManager();

  /**
   * Compresses an image file, returning a thumbnail version.
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
   * Helper to convert an OffscreenCanvas to the best supported blob format.
   * Prioritizes AVIF -> WebP -> JPEG.
   */
  private async canvasToBestBlob(canvas: OffscreenCanvas): Promise<{ blob: Blob; extension: string }> {
    const formats = [
      { type: 'image/avif', ext: 'avif' },
      { type: 'image/webp', ext: 'webp' },
      { type: 'image/jpeg', ext: 'jpg' }
    ];

    for (const format of formats) {
      try {
        const blob = await canvas.convertToBlob({ type: format.type, quality: 0.8 });
        // Some browsers return the requested type even if they don't support it, 
        // but often with size 0 or very small "invalid" data.
        if (blob && blob.size > 0 && blob.type === format.type) {
          return { blob, extension: format.ext };
        }
      } catch (e) {
        // Fall through to next format
      }
    }
    
    // Final fallback
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return { blob, extension: 'jpg' };
  }

  /**
   * Generates a thumbnail for a PDF file.
   */
  private async generatePdfThumbnail(file: File): Promise<File> {
    // Dynamically import pdfjs to avoid issues if not needed
    const pdfjsLib = await import("pdfjs-dist");
    // Use localized worker asset instead of external CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error("Could not get canvas context");

    await page.render({ 
      canvasContext: context as any, 
      canvas: canvas as any,
      viewport 
    } as any).promise;
    
    const { blob, extension } = await this.canvasToBestBlob(canvas);
    return new File([blob], `thumb_${file.name}.${extension}`, { type: blob.type });
  }

  /**
   * Generates a thumbnail for a video file using WebCodecs.
   */
  private async generateVideoThumbnail(file: File): Promise<File> {
    const MP4Box = await import("mp4box");
    const mp4box = (MP4Box as any).createFile();
    
    const arrayBuffer = await file.arrayBuffer();
    (arrayBuffer as any).fileStart = 0;

    return new Promise((resolve, reject) => {
      let videoDecoder: VideoDecoder | null = null;
      let thumbnailGenerated = false;

      const cleanupAndResolve = (result: File) => {
        if (videoDecoder) videoDecoder.close();
        resolve(result);
      };

      const cleanupAndReject = (error: any) => {
        if (videoDecoder) videoDecoder.close();
        reject(error);
      };

      mp4box.onReady = (info: any) => {
        try {
          const videoTrack = info.tracks.find((t: any) => t.video);
          if (!videoTrack) {
            return cleanupAndReject(new Error("No video track found"));
          }

          const config: VideoDecoderConfig = {
            codec: videoTrack.codec,
            codedWidth: videoTrack.video.width,
            codedHeight: videoTrack.video.height,
            description: videoTrack.description
          };

          videoDecoder = new VideoDecoder({
            output: async (frame) => {
              try {
                if (thumbnailGenerated) {
                  frame.close();
                  return;
                }
                thumbnailGenerated = true;

                const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                  frame.close();
                  return cleanupAndReject(new Error("Canvas context failed"));
                }

                ctx.drawImage(frame, 0, 0);
                frame.close();

                const { blob, extension } = await this.canvasToBestBlob(canvas);
                cleanupAndResolve(new File([blob], `thumb_${file.name}.${extension}`, { type: blob.type }));
              } catch (e) {
                cleanupAndReject(e);
              }
            },
            error: (e) => cleanupAndReject(e)
          });

          videoDecoder.configure(config);
          mp4box.setExtractionConfig(videoTrack.id, null, { nb_samples: 1 });
          mp4box.start();
        } catch (e) {
          cleanupAndReject(e);
        }
      };

      mp4box.onSamples = (_id: number, _user: any, samples: any[]) => {
        try {
          if (!videoDecoder || samples.length === 0) return;
          
          const sample = samples[0];
          videoDecoder.decode(new EncodedVideoChunk({
            type: sample.is_sync ? 'key' : 'delta',
            timestamp: sample.cts,
            duration: sample.duration,
            data: sample.data
          }));
          videoDecoder.flush();
        } catch (e) {
          cleanupAndReject(e);
        }
      };

      mp4box.onError = (e: any) => cleanupAndReject(new Error(String(e)));

      try {
        mp4box.appendBuffer(arrayBuffer);
      } catch (e) {
        cleanupAndReject(e);
      }
    });
  }

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
        thumbnailFile = await this.compressImage(file);
      } else if (isPdf) {
        thumbnailFile = await this.generatePdfThumbnail(file);
      } else if (isVideo) {
        thumbnailFile = await this.generateVideoThumbnail(file);
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
   */
  async uploadMediaPair(original: File, thumbnail?: File): Promise<MediaUploadResult> {
    const filesToUpload: File[] = [original];
    if (thumbnail) filesToUpload.push(thumbnail);

    try {
      const results = await this.cdnManager.uploadFiles(filesToUpload, "media");
      
      const originalResult = results[0];
      const thumbnailResult = results[1];

      if (originalResult?.success) {
        let thumbUrl: string | "not-available" = "not-available";
        
        if (thumbnailResult?.success) {
          thumbUrl = thumbnailResult.url;
        } else if (original.type.startsWith("image/")) {
          // For images, the original can serve as its own thumbnail if needed
          thumbUrl = originalResult.url;
        }

        return { 
          success: true, 
          urls: [originalResult.url, thumbUrl]
        };
      } else {
        return { success: false, urls: null, error: originalResult?.error || "Upload failed" };
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
