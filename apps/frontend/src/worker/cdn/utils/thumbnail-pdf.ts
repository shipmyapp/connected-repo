// @ts-ignore - Vite handled URL import for localized worker
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { canvasToBestBlob } from "../../../utils/thumbnail-compression";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

/**
 * Generates a thumbnail for a PDF file.
 */
export async function generatePdfThumbnail(file: File): Promise<File> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

    const arrayBuffer = await file.arrayBuffer();
    
    // Simpler implementation: mock ownerDocument to avoid "createElement" error in worker
    // while using the default library factories.
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      isOffscreenCanvasSupported: true,
      useWorkerFetch: true,
      ownerDocument: {
        createElement: (name: string) => {
          if (name === "canvas") return new OffscreenCanvas(1, 1);
          return null;
        }
      } as any
    });
    
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    const firstPage: PDFPageProxy = await pdf.getPage(1);
    
    const viewport = firstPage.getViewport({ scale: 0.5 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error("Could not get OffscreenCanvas context");

    await firstPage.render({
      canvasContext: context as any,
      canvas: canvas as any,
      viewport 
    }).promise;
    
    const { blob, extension } = await canvasToBestBlob(canvas);
    return new File([blob], `thumb_${file.name}.${extension}`, { type: blob.type });
  } catch (error: any) {
    // Handle password-protected PDFs by generating a placeholder
    if (error?.name === "PasswordException" || error?.message?.includes("password")) {
      console.info("[ThumbnailPDF] PDF is password protected, generating placeholder...");
      return generatePasswordPlaceholder(file.name);
    }

    console.error("[ThumbnailPDF] PDF thumbnail generation failed:", error);
    throw error;
  }
}

/**
 * Generates a placeholder thumbnail for password-protected PDFs.
 * Draws a simple PDF icon with a lock.
 */
async function generatePasswordPlaceholder(fileName: string): Promise<File> {
  const canvas = new OffscreenCanvas(300, 400);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get context for placeholder");

  // Clear background (rounded white page)
  ctx.fillStyle = "#f0f0f0";
  ctx.beginPath();
  ctx.roundRect(20, 20, 260, 360, 20);
  ctx.fill();
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw Lock Icon (Simplified)
  ctx.fillStyle = "#999";
  // Body
  ctx.beginPath();
  ctx.roundRect(110, 180, 80, 60, 8);
  ctx.fill();
  // Shackle
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(150, 180, 25, Math.PI, 0);
  ctx.stroke();

  // "PDF" Text
  ctx.fillStyle = "#666";
  ctx.font = "bold 50px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PDF", 150, 340);

  const { blob, extension } = await canvasToBestBlob(canvas);
  return new File([blob], `locked_${fileName}.${extension}`, { type: blob.type });
}
