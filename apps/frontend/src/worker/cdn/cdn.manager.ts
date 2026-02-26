import { orpcFetch } from "@frontend/utils/orpc.client";
import axios from "axios";
import type { FileProgress, UploadResult, CDNProgressUpdate, IdentifiedFile } from "./cdn.types";

export class CDNManager {
  /**
   * Uploads multiple files by first getting presigned URLs from the backend.
   */
  async uploadFiles(
    files: IdentifiedFile[],
    resourceType: string = "media",
    onProgress?: (update: CDNProgressUpdate) => void
  ): Promise<UploadResult[]> {
    try {
      // 1. Get presigned URLs for all files in batch
      const presignedData = await this.getBatchPresignedUrls(files, resourceType);

      // 2. Upload files in parallel
      const uploadPromises = files.map(async (file, index) => {
        const presigned = presignedData[index]!;
        return this.uploadToUrl(file, presigned, (progress) => {
           // Aggregate progress if needed, but for now we just track last
           onProgress?.({ fileProgress: [{ fileName: file.name, progress, stage: 'uploading' }] });
        });
      });

      return Promise.all(uploadPromises);
    } catch (error) {
      console.error("[CDNManager] Batch operation failed:", error);
      const errorMsg = error instanceof Error ? error.message : "Batch upload failed";
      
      return files.map((file) => ({
        success: false,
        url: "",
        file,
        error: errorMsg,
      }));
    }
  }

  /**
   * Internal helper to get batch presigned URLs.
   */
  async getBatchPresignedUrls(files: IdentifiedFile[], resourceType: string = "media") {
    return await orpcFetch.cdn.generateBatchPresignedUrls(
      files.map((f) => ({
        id: f.id,
        fileName: f.name,
        resourceType,
        contentType: f.type,
      }))
    );
  }

  /**
   * Internal helper to upload a single file to a presigned URL.
   */
  async uploadToUrl(
    file: File, 
    presigned: { signedUrl: string, fetchUrl: string },
    onProgress?: (progress: number) => void
  ): Promise<UploadResult> {
    try {
      await axios.put(presigned.signedUrl, file, {
        headers: {
          "Content-Type": file.type,
          "x-amz-acl": "public-read"
        },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          onProgress?.(progress);
        },
      });

      return {
        success: true,
        url: presigned.fetchUrl,
        file,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Upload failed";
      return {
        success: false,
        url: "",
        file,
        error: errorMsg,
      };
    }
  }
}
