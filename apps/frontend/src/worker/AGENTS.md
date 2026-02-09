# 🤖 Worker Architecture Guidelines

The application uses TWO dedicated web workers to maintain UI responsiveness and domain isolation.

### 1. The Data Worker (`data.worker.ts`)
- **Role**: Source of truth for all local data and synchronization.
- **State**: HOLDER of the Dexie.js database instance.
- **Responsibilities**:
  - Managing all local IndexedDB persistence via Dexie.
  - Orchestrating the background `SyncOrchestrator`.
  - Managing real-time SSE event subscriptions and heartbeats.
- **Strict Rule**: This is the ONLY worker allowed to access the database.

### 2. The Media Worker (`media.worker.ts`)
- **Role**: High-performance content processing and networking.
- **State**: **STATELESS**. Does not have access to the database.
- **Responsibilities**:
  - PDF rendering (using `pdfjs-dist`).
  - Video frame extraction (using `mp4box` and `VideoDecoder`).
  - Image compression (using `browser-image-compression`).
  - CDN uploads (using `Axios`).
- **Strict Rule**: Must return processed results (Blobs/URLs) to the caller. It never persists data directly.

---

### Communication Pattern

1. **UI Thread** calls `getDataProxy()` for regular database operations.
2. **UI Thread** calls `getMediaProxy()` only if direct media processing is needed (rare).
3. **Data Worker** (via `SyncOrchestrator`) calls `getMediaProxy()` to offload heavy thumbnailing or upload tasks.

> [!IMPORTANT]
> Always maintain this separation. Do not add database dependencies to the Media Worker. If the Media Worker needs data from the DB, it must be passed as an argument from the Data Worker.
