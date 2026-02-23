/**
 * Generic helper to convert any canvas (HTMLCanvasElement or OffscreenCanvas) 
 * to the best supported blob format.
 * Prioritizes AVIF -> WebP -> JPEG.
 */
export async function canvasToBestBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<{ blob: Blob; extension: string }> {
  const formats = [
    { type: 'image/avif', ext: 'avif' },
    { type: 'image/webp', ext: 'webp' },
    { type: 'image/jpeg', ext: 'jpg' }
  ];

  for (const format of formats) {
    try {
      const blob = await getBlobFromCanvas(canvas, format.type);
      
      if (blob && blob.size > 0 && blob.type === format.type) {
        return { blob, extension: format.ext };
      }
    } catch (e) {
      // Fall through to next format
    }
  }
  
  // Final fallback
  const blob = await getBlobFromCanvas(canvas, 'image/jpeg');
  if (!blob) throw new Error("Could not export canvas to blob");
  return { blob, extension: 'jpg' };
}

/**
 * Normalizes the different blob APIs between HTMLCanvasElement and OffscreenCanvas.
 */
async function getBlobFromCanvas(canvas: HTMLCanvasElement | OffscreenCanvas, type: string): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    // OffscreenCanvas (Worker or Modern Main Thread)
    return await canvas.convertToBlob({ type, quality: 0.8 });
  } else {
    // HTMLCanvasElement (Main Thread)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, 0.8);
    });
  }
}
