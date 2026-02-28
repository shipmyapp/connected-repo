# 🤖 Worker Architecture Guidelines

The application uses TWO dedicated web workers to maintain UI responsiveness and domain isolation.

### 1. The Data Worker (`data.worker.ts`)
- **Role**: Source of truth for all local data and synchronization.
- **State**: HOLDER of the Dexie.js database instance.
- **Responsibilities**:
  - Managing all local IndexedDB persistence via Dexie.
  - Orchestrating the background `SyncOrchestrator`. See [Detailed Sync Logic](file:///Users/krishna404/codeProjects/shipmyapp/connected-repo/apps/frontend/src/worker/sync/SYNC_LOGIC.md).
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
  - Data export (CSV and PDF generation via `ExportService`).
- **Strict Rule**: Must return processed results (Blobs/URLs) to the caller. It never persists data directly.

---

### 🟢 Active Task: Storage Persistence & Protection (002)
- **Status**: ✅ COMPLETED
- **Intent**: Ensure "Pending Sync" data durability via OPFS and Background Sync.
- **Context**: Moved large blobs to OPFS to avoid IDB eviction and added W3C Background Sync for reliability.

### Decision Records

| ID | Title | Status | Description |
|---|---|---|---|
| 001 | Use OPFS for Attachments | Decided | Move binary blobs from IndexedDB to OPFS to prevent browser eviction and improve performance. |
| 002 | W3C Background Sync | Decided | Register sync tags in SW to trigger DataWorker sync cycles even after tab closure. |
| 003 | SHA-256 Checksums | Decided | Store local checksums to verify integrity before/after OPFS operations and during sync. |
| 004 | Virtual Media Provider | Decided | Serve OPFS media via Service Worker fetch interception to avoid avoid `URL.createObjectURL` overhead. |

> [!IMPORTANT]
> Always maintain this separation. Do not add database dependencies to the Media Worker. If the Media Worker needs data from the DB, it must be passed as an argument from the Data Worker.
