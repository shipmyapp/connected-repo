# Plan: Storage Persistence & Protection (002)

## Objective
Ensure that "Pending Sync" data survives browser storage pressure, accidental tab closures, and device restarts.

## Context
In an offline-first app, data exists only on the device initially. We must prevent the browser from evicting this data and ensure it's stored efficiently.

## Proposed Strategy

### 1. Persistent Storage Request
- **API**: [StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).
- **Implementation**: On first write or app load, check `navigator.storage.persisted()`. If false, call `navigator.storage.persist()`.
- **Benefit**: Prevents the browser from silently clearing IndexedDB when disk space is low.

### 2. Origin Private File System (OPFS) for Attachments
- **API**: [File System Access API (OPFS)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).
- **Implementation**: 
    - Move large binary attachments from IndexedDB Blobs to OPFS.
    - IndexedDB will store only the metadata and the OPFS file handle.
- **Benefit**: Faster performance and reduced IndexedDB bloat.

### 3. Background Sync (W3C Sync API)
- **Implementation**: Register a sync tag (e.g., `'sync-pending-entries'`) in the Service Worker.
- **Benefit**: OS wakes up the SW to sync even after the app is closed.

### 4. Integrity Checksums
- **Implementation**: Store MD5/SHA-256 hash locally.
- **Verification**: Backend verifies hash against payload to ensure no corruption.

## Success Criteria
- Chrome/Safari marks site storage as "Persistent".
- Data successfully syncs in the background.
