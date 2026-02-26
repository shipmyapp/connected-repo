# Plan: Offline Export & CDN-Direct Recovery

## Objective
Provide a "break glass" recovery mechanism for users with pending data when the primary backend server is unavailable, but the CDN infrastructure is functional.

## Context
In an offline-first architecture, "Pending Sync" entries are at risk if the local database is cleared or the device is lost before the backend recovers. This provides a way to secure that data externally.

## Proposed Strategy

### 1. Data Export (`.expowiz`)
- **Format**: A ZIP-based format containing JSON metadata of journal entries and the raw binary blobs of all associated attachments.
- **Trigger**: A "Download Recovery Backup" button in the Sync Status UI.
- **Scope**: Only includes records with `_pendingAction === 'create'` or missing `cdnUrl`.

### 2. CDN-Direct Fallback
- **Logic**: If the `SyncOrchestrator` detects persistent 5xx or connection errors from the backend, but successful pings to the CDN:
    - Trigger `MediaWorker` to upload blobs to the CDN directly.
    - Store the resulting `cdnUrl` in the local DB.
    - Mark the entry as "Media Synced, Metadata Pending".
- **Benefit**: Ensures media is safe even if the application database is unreachable.

### 3. Restoration Flow
- Facility to re-import a `.expowiz` file into the local Dexie DB on a different device/session to resume the sync once the backend is healthy.

## Success Criteria
- User can trigger a download of a single `.expowiz` file containing all current local-only data.
- Sync orchestrator successfully populates CDN URLs locally even when the backend router is simulated as "Down".
