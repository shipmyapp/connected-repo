# Plan: Client-Side Error Telemetry

## Objective
Implement a robust error logging system that captures client-side exceptions (workers, UI, sync failures) and sends them to the backend for analysis, ensuring visibility into production issues.

## Context
Currently, errors occurring in background workers (DataWorker, MediaWorker) or during sync may be invisible to developers unless the user reports them. We need a centralized way to collect these.

## Proposed Strategy

### 1. Local Error Storage
- **Table**: Add a `client_errors` table to Dexie.
- **Fields**:
  - `id`: ULID
  - `timestamp`: ISO String
  - `message`: Error message
  - `stack`: Stack trace (if available)
  - `context`: String (e.g., "MediaWorker:upload", "SyncOrchestrator:run")
  - `userAgent`: Browser/OS info

### 2. Error Capture Wrapper
- Create a global `logClientError(error, context)` utility.
- Wrap critical paths (Comlink worker methods, Sync loops, Thumbnail generation) in try/catch blocks that call this utility.
- **Filtering**: Do NOT log "No Internet" or "AbortError" (user-initiated) to avoid noise.

### 3. Sync Logic (Unauthenticated)
- **Endpoint**: `POST /api/telemetry/errors` on the backend.
- **Requirement**: This endpoint must be accessible without a session token (or use a public API key) to capture errors even when the user is logged out or auth is failing.
- **Trigger**: Run a background sync job in `DataWorker` that polls the `client_errors` table and sends batches to the backend.
- **Cleanup**: Delete the local record ONLY after a successful `201 Created` response from the server.

## Success Criteria
- Errors in workers are persisted to IndexedDB.
- Errors are successfully POSTed to the backend.
- Local error table is cleared upon successful sync.
- Telemetry does not fail if the user is unauthenticated.
