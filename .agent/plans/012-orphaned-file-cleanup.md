# Plan: Orphaned File Cleanup

## Objective
Implement a robust, automated cleanup mechanism to purge orphaned file records and their associated binaries (OPFS/CDN) that result from abandoned form submissions or failed sync cycles.

## Context
The current "early-upload" pattern creates file records and uploads binaries immediately upon selection. If a user abandons a form (e.g., Journal Entry) without saving, these files remain in IndexedDB, OPFS, the CDN, and the backend metadata store, leading to a "storage leak."

## Proposed Strategy

### 1. Frontend Garbage Collection (DataWorker)
- **Method**: `filesDb.garbageCollectOrphans()`
- **Logic**: 
    - Scan the `files` table for records created > 24 hours ago.
    - Check if the corresponding parent record (e.g., `journalEntries` with `id === file.tableId`) exists.
    - If the parent is missing:
        - Delete binary files from OPFS.
        - Delete the record from IndexedDB.
- **Trigger**: Run once during `SyncOrchestrator.start()`.

### 2. Backend Cleanup Service
- **Service**: `CleanupOrphanedFilesService`
- **Logic**:
    - Query the `files` table for records > 24 hours old.
    - Perform a join or subquery to check if the parent record in `tableName` exists.
    - Delete orphaned rows from the `files` table.
- **Trigger**: Integrate into the `perMinuteCron` with a throttle (e.g., execute once per day).

## Success Criteria
- [ ] Orphaned files (no parent record) older than 24 hours are automatically purged from the frontend IndexedDB/OPFS.
- [ ] Orphaned metadata records are purged from the backend `files` table.
- [ ] No valid files (those with existing parent records) are accidentally deleted.
