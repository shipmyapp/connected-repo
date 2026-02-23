import imageCompression from "browser-image-compression";
import { canvasToBestBlob } from "../../../utils/thumbnail-compression";

/**
 * Compresses an image file, returning a thumbnail version.
 */
export async function generateImageThumbnail(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("File is not an image");

  try {
    const options = {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1200,
      useWebWorker: false, // We ARE already in a web worker
      initialQuality: 0.8,
    };

    // First pass compression
    const compressedBlob = await imageCompression(file, options);
    
    // To use canvasToBestBlob, we need to draw the blob to a canvas
    const img = await createImageBitmap(compressedBlob);
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get context for image re-encoding");
    
    ctx.drawImage(img, 0, 0);
    img.close();

    // Re-encode to the best supported format (AVIF -> WebP -> JPEG)
    const { blob, extension } = await canvasToBestBlob(canvas);
    
    return new File([blob], `thumb_${file.name}.${extension}`, {
      type: blob.type,
    });
  } catch (error) {
    console.warn("[ThumbnailImage] Image compression failed:", error);
    throw error;
  }
}
