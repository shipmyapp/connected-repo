import { orpcFetch } from "@frontend/utils/orpc.client";
import axios from "axios";
import type { CDNProgressUpdate, IdentifiedFile, UploadResult } from "./cdn.types";

export class CDNManager {
  /**
   * Uploads multiple files by first getting presigned URLs from the backend.
   */
  async uploadFiles(
    files: IdentifiedFile[],
    resourceType = "media",
    onProgress?: (update: CDNProgressUpdate) => void,
  ): Promise<UploadResult[]> {
    try {
      const presignedData = await this.getBatchPresignedUrls(files, resourceType);

      const uploadPromises = files.map(async (item, index) => {
        const presigned = presignedData[index];
        if (!presigned) {
          return {
            success: false,
            url: "",
            file: item.file,
            error: "No presigned URL returned for file",
          };
        }
        return this.uploadToUrl(item.file, presigned, (progress) => {
          onProgress?.({
            fileProgress: [{ fileName: item.file.name, progress, stage: "uploading" }],
          });
        });
      });

      return Promise.all(uploadPromises);
    } catch (error) {
      console.error("[CDNManager] Batch operation failed:", error);
      const errorMsg = error instanceof Error ? error.message : "Batch upload failed";

      return files.map((item) => ({
        success: false,
        url: "",
        file: item.file,
        error: errorMsg,
      }));
    }
  }

  /**
   * Internal helper to get batch presigned URLs.
   */
  async getBatchPresignedUrls(files: IdentifiedFile[], resourceType = "media") {
    return await orpcFetch.cdn.generateBatchPresignedUrls(
      files.map((item) => ({
        id: item.id,
        fileName: item.file.name,
        resourceType,
        contentType: item.file.type,
      })),
    );
  }

  /**
   * Internal helper to upload a single file to a presigned URL.
   */
  async uploadToUrl(
    file: File,
    presigned: { signedUrl: string; fetchUrl: string },
    onProgress?: (progress: number) => void,
  ): Promise<UploadResult> {
    try {
      await axios.put(presigned.signedUrl, file, {
        headers: {
          "Content-Type": file.type,
          "x-amz-acl": "public-read",
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

  /**
   * Checks if a file exists on the CDN remote storage.
   */
  async checkFileExistsInCdn(item: IdentifiedFile) {
    try {
      const result = await orpcFetch.cdn.checkFileExistsInCdn({
        id: item.id,
        fileName: item.file.name,
        resourceType: "media",
        contentType: item.file.type,
      });
      return result;
    } catch (error) {
      console.error("[CDNManager] Check file existence failed:", error);
      return { exists: false, key: "" };
    }
  }
}
