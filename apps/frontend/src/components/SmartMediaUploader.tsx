import React, { useCallback, useEffect, useRef } from 'react';
import { ulid } from "ulid";
import { MediaUploader, type MediaFile } from "@connected-repo/ui-mui/components/MediaUploader";

interface SmartMediaUploaderProps {
  value: MediaFile[];
  onChange: React.Dispatch<React.SetStateAction<MediaFile[]>>;
  maxFiles?: number;
  teamId: string | null;
  tableId: string;
  tableName: "journalEntries";
}

/**
 * A truly "Smart" version of MediaUploader.
 * Handles adding/removing files with ObjectURL management and 
 * triggers background thumbnail generation automatically.
 */
export const SmartMediaUploader: React.FC<SmartMediaUploaderProps> = ({
  value,
  onChange,
  maxFiles = 20,
  teamId,
  tableId,
  tableName
}) => {
  const processingIds = useRef(new Set<string>());

  const handleAddFiles = useCallback(async (newFiles: File[]) => {
    const { getAuthCache } = await import("@frontend/utils/auth.persistence");
    const { getDataProxy } = await import("@frontend/worker/worker.proxy");
    const session = getAuthCache();
    const app = await getDataProxy();

    const newMediaBatch: MediaFile[] = [];

    for (const file of newFiles) {
        const id = ulid();
        const media: MediaFile = {
            id,
            file,
            previewUrl: URL.createObjectURL(file),
        };
        newMediaBatch.push(media);

        // Persist immediately to DB
        await app.filesDb.upsertLocal({
            id,
            tableId,
            tableName,
            type: "attachment",
            fileName: file.name,
            mimeType: file.type,
            teamId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            cdnUrl: null,
            thumbnailCdnUrl: null,
            createdByUserId: session?.user?.id || "",
            deletedAt: null,
            _blob: file,
            _thumbnailBlob: null,
            _pendingAction: 'create',
        });
    }

    onChange(prev => [...prev, ...newMediaBatch]);
  }, [onChange, teamId, tableId, tableName]);

  const handleRemoveFile = useCallback(async (id: string) => {
    const { getDataProxy } = await import("@frontend/worker/worker.proxy");
    const app = await getDataProxy();

    onChange(prev => {
      const target = prev.find(f => f.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.thumbnailUrl) URL.revokeObjectURL(target.thumbnailUrl);
      }
      return prev.filter(f => f.id !== id);
    });

    // Remove from DB
    await app.filesDb.bulkDelete([id]);
  }, [onChange]);

  // Background thumbnail generation watcher
  useEffect(() => {
    const toProcess = value.filter(f => !f.thumbnailUrl && !processingIds.current.has(f.id));

    toProcess.forEach((media) => {
      processingIds.current.add(media.id);
      
      (async () => {
        try {
          let thumbnailFile: File | null = null;
          const { getMediaProxy, getDataProxy } = await import("@frontend/worker/worker.proxy");
          const [mediaProxy, dataProxy] = await Promise.all([getMediaProxy(), getDataProxy()]);

          if (media.file.type.startsWith("video/")) {
            const { generateVideoThumbnailUI } = await import("../utils/thumbnail-video-ui");
            thumbnailFile = await generateVideoThumbnailUI(media.file);
          } else if (media.file.type.startsWith("image/") || media.file.type === "application/pdf") {
            const result = await mediaProxy.media.generateThumbnail(media.file);
            thumbnailFile = result.thumbnailFile;
          }

          if (thumbnailFile) {
            const thumbUrl = URL.createObjectURL(thumbnailFile);

            // Persist thumbnail to DB
            await dataProxy.filesDb.update(media.id, {
              _thumbnailBlob: thumbnailFile,
            });

            // Emit atomic update via functional approach to prevent race conditions
            onChange(prev => prev.map(item => 
              item.id === media.id ? { ...item, thumbnailUrl: thumbUrl } : item
            ));
          }
        } finally {
          processingIds.current.delete(media.id);
        }
      })();
    });
  }, [value, onChange]);

  return (
    <MediaUploader
      files={value}
      onAddFiles={handleAddFiles}
      onRemoveFile={handleRemoveFile}
      maxFiles={maxFiles}
    />
  );
};
