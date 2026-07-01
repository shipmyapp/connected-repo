# Web Worker Architecture

The application uses a single dedicated web worker for off-main-thread media work.

### Media Worker (`media.worker.ts`)
- **Role**: Stateless content processing and CDN networking.
- **Responsibilities**:
  - Image thumbnail generation (`browser-image-compression`).
  - PDF thumbnail rendering (`pdfjs-dist`).
  - CDN uploads via presigned URLs (`axios`).
- **Communication**: Exposed via Comlink. Access from the main thread with
  `getMediaProxy()` in `worker.proxy.ts`.
- **Strict Rule**: Stateless. Returns Blobs / CDN URLs to the caller — it never
  persists data locally.

Video thumbnails are still generated on the main thread
(`utils/thumbnail-video-ui.ts`) because `VideoDecoder` / `<video>` APIs require
a DOM-backed runtime.
