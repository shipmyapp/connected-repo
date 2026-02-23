/**
 * Generates a thumbnail for a video file using the main thread (DOM).
 * This is simpler and more reliable than WebCodecs in a Worker for most formats.
 */
export async function generateVideoThumbnailUI(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let seekAttempts = 0;
    
    video.preload = 'metadata';
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      // Start by seeking to 1s or 10%
      video.currentTime = Math.min(1, video.duration / 10);
    };

    video.onseeked = async () => {
      // Yield to let the UI breathe
      await new Promise(r => setTimeout(r, 0));

      requestAnimationFrame(async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Could not get canvas context");
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Check if the frame is "visual" (not all black/empty)
          if (isFrameVisual(ctx, canvas.width, canvas.height) || seekAttempts >= 3) {
            const { canvasToBestBlob } = await import("./thumbnail-compression");
            const { blob, extension } = await canvasToBestBlob(canvas);
            
            const thumbFile = new File([blob], `thumb_${file.name}.${extension}`, { type: blob.type });
            cleanup();
            resolve(thumbFile);
          } else {
            // Frame was too dark, try another point (25%, 50%, 75%)
            seekAttempts++;
            const nextPoints = [0.25, 0.5, 0.75];
            video.currentTime = video.duration * (nextPoints[seekAttempts - 1] ?? 0.5);
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Video loading failed"));
    };
  });
}

/**
 * Basic check to see if a frame has actual visuals (not just black/empty).
 * Samples a few pixels and checks average brightness.
 */
function isFrameVisual(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const sampleSize = 100;
    const x = Math.max(0, (width - sampleSize) / 2);
    const y = Math.max(0, (height - sampleSize) / 2);
    
    const imageData = ctx.getImageData(x, y, Math.min(width, sampleSize), Math.min(height, sampleSize));
    const data = imageData.data;
    
    let brightnessSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i+1] ?? 0;
      const b = data[i+2] ?? 0;
      brightnessSum += (r + g + b) / 3;
    }
    
    const avgBrightness = brightnessSum / (data.length / 4);
    return avgBrightness > 15;
  } catch (e) {
    return true;
  }
}
