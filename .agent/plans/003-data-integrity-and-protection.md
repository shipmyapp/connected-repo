# Plan: Data Integrity & Storage Protection

## Objective
Ensure that "Pending Sync" data survives browser storage pressure, accidental tab closures, and device restarts.

## Proposed Strategy

### 1. Persistent Storage Request
- **API**: [StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).
- **Implementation**: On first write or app load, check `navigator.storage.persisted()`. If false, call `navigator.storage.persist()`.
- **Benefit**: Prevents the browser from silently clearing IndexedDB when disk space is low (Storage Eviction).

### 2. Origin Private File System (OPFS) for Attachments
- **API**: [File System Access API (OPFS)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).
- **Implementation**: 
    - Move large binary attachments from IndexedDB Blobs to OPFS.
    - IndexedDB will store only the metadata and the OPFS file path/handle.
- **Benefit**: 
    - **Performance**: Significantly faster read/write for large images/videos.
    - **Stability**: Reduces the memory pressure and bloat within IndexedDB, which can lead to database corruption in some browsers when handling many large Blobs.

### 3. Background Sync (W3C Sync API)
- **Implementation**: 
    - Register a sync tag (e.g., `'sync-pending-entries'`) in the Service Worker.
    - The OS will wake up the SW even after the app is closed to attempt a sync when the connection is stable.
- **Fallback**: Use `Periodic Background Sync` for non-critical catch-ups.

### 4. Integrity Checksums
- **Implementation**: Store an MD5/SHA-256 hash of the content and attachments locally.
- **Verification**: The backend verifies the hash against the received payload. This ensures that a partial sync or corruption in the local DB doesn't lead to corrupted records on the server.

## Success Criteria
- Chrome/Safari marks the site storage as "Persistent".
- Closing the tab with pending data triggers a browser confirmation dialog.
- Data successfully syncs in the background while the browser is minimized/closed.
