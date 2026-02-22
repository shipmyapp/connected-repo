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

* **Status Fields:**
  - Journal entries: `'file-upload-pending' | 'file-upload-completed' | 'synced' | 'failed'`
  - Files: `'pending' | 'in-progress' | 'completed' | 'failed'`

* **Polymorphic File Sync (v3):**
  - Files are now synced independently of their parent table using `tableName` and `tableId`.
  - Incremental updates for files are fetched via `files.delta` endpoint based on user/team.
  - Parent entities (e.g., `journalEntries`) store `attachmentFileIds: string[]` instead of direct URLs.
  - UI components fetch files reactively using `useLocalDb("files", ...)` filtered by `tableId`.

* **SyncOrchestrator Flow:**
  1. File Upload Stage (independent of parent):
     - Thumbnail generation -> CDN upload -> Backend meta creation (`files.create`).
     - Local file status transitions to `completed` + `synced`.
  2. Parent Entity Sync Stage:
     - Parent record (e.g., journal entry) is synced with `attachmentFileIds`.
     - Backend links files to the parent via `afterCreate` hooks if needed.

* **Cross-Context Communication:** BroadcastChannel("db-updates") notifies SSE manager in Service Worker when pending entries change

* **File Schema (v2):**
  - `cdnUrls?: [string, "not-available" | string] | null` - [originalUrl, thumbnailUrl]
  - `thumbnailBlob?: Blob | null` - compressed thumbnail
  - `thumbnailStatus` - thumbnail generation state
  - `errorCount` - retry counter for failed operations

### 6. Deletion & Sync Integrity (CRITICAL)

* **Synced Entries (`journalEntries`)**:
    - **UI Rule**: DO NOT call `journalEntriesDb.delete()` from the frontend UI for synced entries. These deletions must happen on the backend via oRPC to ensure all devices receive the deletion event.
    - **Worker Use only**: The local `delete()` method in `JournalEntriesDBManager` is reserved for the sync engine to purge local cache after a server confirmation or a full sync refresh.

* **Pending Entries & Files**:
    - Deleting a pending parent record DOES NOT automatically delete its pending files if they are meant to be shareable. However, for ephemeral attachments, `journalEntriesDb.delete()` cleans up associated records.
    - `filesDb.delete()` is used to remove local binary Blobs after successful CDN upload or cancellation.