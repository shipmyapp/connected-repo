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
  - `deviceInfo`: Client device info
  - `appVersion`: Version of the app running
  - `clientId`: Client database identifier (if unauthenticated, might be empty / generated)
  - `teamId`: Team context under which the error occurred (if applicable)

### 2. Error Capture Wrapper
- Create a global `logClientError(error, context)` utility.
- Wrap critical paths (Comlink worker methods, Sync loops, Thumbnail generation) in try/catch blocks that call this utility.
- **Filtering**: Do NOT log "No Internet" or "AbortError" (user-initiated) to avoid noise.

### 3. Sync Logic (One-Way Client to Server)
- **Nature of Sync**: Unlike full-duplex sync data (e.g. issues, entries), error telemetry sync is strictly **One-Way (Client -> Server)**. The client pushes errors upwards and the backend never disseminates error records down to clients.
- **Endpoint**: `POST /api/telemetry/errors` on the backend.
- **Requirement**: This endpoint must be accessible without a session token (or use a public API key) to capture errors even when the user is logged out or auth is failing.
- **Trigger**: Run a background sync job in `DataWorker` that polls the `client_errors` table and sends batches to the backend.
- **Cleanup**: Delete the local error data entirely ONLY after a successful `201 Created` response from the server. (No soft-deletes; actual record deletion offline once synced).
- **Backend Storage**: The backend database must store these errors associating them with the `client_id`, `team_id`, `device` details, and `version` details transmitted by the app.

## Success Criteria
- Errors in workers are persisted to IndexedDB.
- Errors are successfully POSTed to the backend.
- Local error table is cleared upon successful sync.
- Telemetry does not fail if the user is unauthenticated.
