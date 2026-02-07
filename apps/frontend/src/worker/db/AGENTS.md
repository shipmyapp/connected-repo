## 🛠 Database Architecture Manifest (Dexie.js + Web Worker)

### 1. Threading Model

* **Dedicated Worker:** The database instance (Dexie) MUST only exist inside the Web Worker.
* **Comlink Bridge:** All UI-to-DB communication happens via Comlink proxies.
* **Reactivity:** UI reactivity is handled via a custom `subscribe` method in the Worker that triggers `Comlink.proxy` callbacks in the UI thread when tables change.

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



### 5. Sync State (Stage 4 Readiness)

* **Status Field:** Every record should have a `status` enum:
* `'syncing' | 'synced' | 'sync-failed' | 'file-upload-pending'` | etc...