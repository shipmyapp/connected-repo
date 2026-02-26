# Plan: Ghost Blob Cleanup Strategy (001)

## Objective
Prevent the `SyncOrchestrator` from entering infinite error cycles by identifying and cleaning up metadata records that are missing their associated binary data (`_blob`).

## Context
Metadata records for files may exist in IndexedDB without their corresponding binary data due to browser storage eviction or partial deletions. The sync loop currently enters an error cycle trying to upload null blobs.

## Proposed Strategy
1. **Cleanup Job**: Add a `cleanupOrphans()` method to `FilesDBManager`.
2. **Identification**: Filter records where `_pendingAction === 'create'` but `_blob` is null or undefined.
3. **Execution**: 
   - For orphans, either delete the record or move it to a "Corrupted" state with user notification.
4. **Trigger**: Run this cleanup during `SyncOrchestrator.start()` or via `requestIdleCallback`.

## Success Criteria
- Sync queue no longer blocks on records with missing blobs.
- Corrupted records are either purged or flagged for user intervention.
