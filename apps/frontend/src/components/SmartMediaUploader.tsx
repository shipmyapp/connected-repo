import { type MediaFile, MediaUploader } from "@connected-repo/ui-mui/components/MediaUploader";
import { getMediaProxy } from "@frontend/worker/worker.proxy";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { ulid } from "ulid";

interface SmartMediaUploaderProps {
	value: MediaFile[];
	onChange: React.Dispatch<React.SetStateAction<MediaFile[]>>;
	maxFiles?: number;
}

/**
 * Wraps `MediaUploader` with two helpers:
 *  - Generates ObjectURL previews for newly added files.
 *  - Kicks off background thumbnail generation via the media worker so the
 *    parent form can include thumbnails when uploading to the CDN.
 *
 * No local persistence — files live in component state until the parent form
 * uploads them. Object URLs are revoked when files are removed/unmounted.
 */
export const SmartMediaUploader: React.FC<SmartMediaUploaderProps> = ({
	value,
	onChange,
	maxFiles = 20,
}) => {
	const processingIds = useRef(new Set<string>());

	const handleAddFiles = useCallback(
		(newFiles: File[]) => {
			const newMediaBatch: MediaFile[] = newFiles.map((file) => ({
				id: ulid(),
				file,
				previewUrl: URL.createObjectURL(file),
			}));
			onChange((prev) => [...prev, ...newMediaBatch]);
		},
		[onChange],
	);

	const handleRemoveFile = useCallback(
		(id: string) => {
			onChange((prev) => {
				const target = prev.find((f) => f.id === id);
				if (target) {
					if (target.previewUrl.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl);
					if (target.thumbnailUrl?.startsWith("blob:")) URL.revokeObjectURL(target.thumbnailUrl);
				}
				return prev.filter((f) => f.id !== id);
			});
		},
		[onChange],
	);

	// Background thumbnail generation watcher.
	useEffect(() => {
		const toProcess = value.filter(
			(f) => !f.thumbnailUrl && !processingIds.current.has(f.id),
		);

		toProcess.forEach((media) => {
			processingIds.current.add(media.id);

			(async () => {
				try {
					let thumbnailFile: File | null = null;

					if (media.file.type.startsWith("video/")) {
						const { generateVideoThumbnailUI } = await import("../utils/thumbnail-video-ui");
						thumbnailFile = await generateVideoThumbnailUI(media.file);
					} else if (media.file.type.startsWith("image/") || media.file.type === "application/pdf") {
						const mediaProxy = await getMediaProxy();
						const result = await mediaProxy.media.generateThumbnail(media.file);
						thumbnailFile = result.thumbnailFile;
					}

					if (thumbnailFile) {
						const thumbUrl = URL.createObjectURL(thumbnailFile);
						onChange((prev) =>
							prev.map((item) =>
								item.id === media.id
									? { ...item, thumbnailUrl: thumbUrl, thumbnailFile }
									: item,
							),
						);
					}
				} catch (err) {
					console.error("[SmartMediaUploader] Thumbnail generation failed:", err);
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
