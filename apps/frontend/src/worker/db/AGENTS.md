## 🛠 Database Architecture Manifest (Dexie.js + Web Worker)

### 1. Threading Model & Domain Isolation

* **Dedicated Data Worker:** The database instance (Dexie) MUST only exist inside the dedicated `DataWorker` (formerly `AppWorker`).
* **Stateless Media Worker:** CPU-intensive tasks (PDF rendering, video decoding, image compression) and CDN uploads MUST live in a separate `MediaWorker`.
* **Persistence Rule:** The `MediaWorker` MUST be stateless. It should never access the DB directly. All persistence is orchestrated by the `DataWorker` after receiving results from the `MediaWorker`.
* **Comlink Bridge:** All UI-to-DB communication happens via `getDataProxy()`. Media tasks use `getMediaProxy()`.
* **Reactivity:** UI reactivity is handled via a custom `subscribe` method in the `DataWorker` that triggers `Comlink.proxy` callbacks in the UI thread when tables change.

### 2. Schema Strictness & Nulls

* **Postgres Alignment:** Every table and field should mirror the Postgres backend.

* **Zod Integration:** All writes to the DB should be validated against the corresponding Zod schema before `put()` or `add()`.

### 3. Versioning & Migrations

* **DB Versioning:** MUST use incremental **Integers** (1, 2, 3...).
* *Warning:* Do NOT use App Version strings (e.g., "1.0.4").


* **Migration Strategy:** Incremental blocks using `.upgrade(tx => { ... })`.
* Always use Zod defaults during upgrades to ensure data integrity when fields are added.
* Example: `entry.attachmentFileIds = entry.attachmentFileIds ?? []`.
* Documentation: https://dexie.org/docs/Version/Version.upgrade()



### 4. Binary/File Storage

* **Native Blobs:** Files are stored in a dedicated `files` table as native `Blob` or `File` objects.
* **Memory Efficiency:** Do not store Blobs in the same table as metadata.
* *Rule:* Query the metadata table for lists; only fetch from the `files` table when the actual binary is needed for display (`URL.createObjectURL`).



### 5. Sync State & File Attachments

* **Status Fields**:
  - All tables: `_pendingAction: 'create' | 'update' | 'delete' | null`
  - Files: `_uploadStatus`, `_thumbnailStatus`, `_syncStatus` (each `'pending' | 'in-progress' | 'completed' | 'failed'`)

* **Polymorphic File Sync (v3)**:
  - Files are synced independently using `tableName` and `tableId` (ULID/UUID).
  - Incremental updates for files are fetched via `files.delta` endpoint.
  - Parent entities (e.g., `journalEntries`) NO LONGER store file IDs; linkage is via the `files` table's `tableId`.
  - UI components fetch files reactively using `useLocalDb("files", ...)` filtered by `tableId`.

* **SyncOrchestrator Flow**:
  1. **Thumbnail Stage**: Generate thumbnail if needed.
  2. **Upload Stage**: Upload both original and thumbnail to CDN using deterministic ULID keys.
  3. **Metadata Stage**: Create the backend file record via `files.create`.
  4. **Completion**: Once all stages for all entity files are done, the entity remains synced via background heartbeats.
* **Cross-Context Communication:** BroadcastChannel("db-updates") notifies SSE manager in Service Worker when pending entries change

* **File Schema (v2):**
  - `cdnUrls?: [string, "not-available" | string] | null` - [originalUrl, thumbnailUrl]
  - `thumbnailBlob?: Blob | null` - compressed thumbnail
  - `thumbnailStatus` - thumbnail generation state
  - `errorCount` - retry counter for failed operations

### 6. Deletion & Sync Integrity (CRITICAL)

* **Synced Entries**:
    - **Online-Only**: Synced records (`_pendingAction === null`) MUST be deleted while online.
    - **Direct Action**: The frontend calls the backend API first, then deletes locally on success.

* **Pending Entries**:
    - **Direct Delete**: Records with `_pendingAction === 'create'` are deleted locally immediately.
    - Associated files in the `files` table should also be purged locally.