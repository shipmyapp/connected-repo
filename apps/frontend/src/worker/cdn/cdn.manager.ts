import { orpcFetch } from "@frontend/utils/orpc.client";
import axios from "axios";
import type { FileProgress, UploadResult, CDNProgressUpdate } from "./cdn.types";

export class CDNManager {
  /**
   * Uploads multiple files by first getting presigned URLs from the backend.
   */
  async uploadFiles(
    files: File[],
    resourceType: string = "media",
    onProgress?: (update: CDNProgressUpdate) => void
  ): Promise<UploadResult[]> {
    const fileProgress: FileProgress[] = files.map((f) => ({
      fileName: f.name,
      progress: 0,
      stage: "getting-urls",
    }));

    const updateProgress = () => {
      onProgress?.({ fileProgress: [...fileProgress] });
    };

    updateProgress();

    try {
      // 1. Get presigned URLs for all files
      // Note: orpcFetch will handle credentials/cookies automatically in the worker
      const response = await orpcFetch.cdn.generateBatchPresignedUrls(
        files.map((f) => ({
          fileName: f.name,
          resourceType,
          contentType: f.type,
        }))
      );

      // 2. Upload files in parallel
      const uploadPromises = files.map(async (file, index) => {
        const { signedUrl, fetchUrl } = response[index]!;
        
        try {
          fileProgress[index]!.stage = "uploading";
          updateProgress();

          await axios.put(signedUrl, file, {
            headers: {
              "Content-Type": file.type,
              "x-amz-acl": "public-read"
            },
            onUploadProgress: (progressEvent) => {
              const progress = progressEvent.total
                ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
                : 0;
              fileProgress[index]!.progress = progress;
              updateProgress();
            },
          });

          fileProgress[index]!.stage = "completed";
          fileProgress[index]!.progress = 100;
          updateProgress();

          return {
            success: true,
            url: fetchUrl,
            file,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Upload failed";
          fileProgress[index]!.stage = "error";
          fileProgress[index]!.error = errorMsg;
          updateProgress();

          return {
            success: false,
            url: "",
            file,
            error: errorMsg,
          };
        }
      });

      const results = await Promise.all(uploadPromises);
      return results;
    } catch (error) {
      console.error("[CDNManager] Batch operation failed:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to get upload URLs";
      
      // Mark all as error
      fileProgress.forEach((p) => {
        p.stage = "error";
        p.error = errorMsg;
      });
      updateProgress();

      return files.map((file) => ({
        success: false,
        url: "",
        file,
        error: errorMsg,
      }));
    }
  }
}
