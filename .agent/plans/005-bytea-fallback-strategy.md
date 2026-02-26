# Plan: Bytea Fallback Strategy

## Objective
Ensure 100% data integrity for file attachments by falling back to backend `bytea` storage if CDN uploads fail.

## Context
Our primary storage is a CDN. However, if the CDN is unreachable or returns persistent errors, we risk data loss if the local device storage is cleared. This plan provides a secondary storage path through our own backend.

## Proposed Strategy

### 1. Enhanced Upload Flow
- Modify `MediaWorker` to attempt CDN upload with exponential backoff.
- If CDN upload fails after N retries (e.g., 3):
  - Transition to "Backend Fallback" mode.
  - POST the binary blob directly to a backend endpoint (e.g., `/api/files/upload-fallback`).

### 2. Backend Support
- Implement an endpoint that receives multi-part/form-data.
- Store the binary data in a `bytea` column in the `files` table or a dedicated `file_blobs` table.
- Return a "Internal Proxy URL" or a flag indicating server-side storage.

### 3. Metadata Update
- Update the local Dexie record:
  - `storageType`: 'CDN' | 'BACKEND_BYTEA'
  - `cdnUrl`: Set to the backend proxy URL if stored as bytea.
  - `isFallback`: true

### 4. Reconciliation
- (Optional) A background task on the server can later attempt to move `bytea` data to the CDN once it's healthy, updating the metadata accordingly.

## Success Criteria
- If CDN is simulated as "Down", files are still successfully "sent" and stored on the backend.
- No data is lost despite primary storage failure.
- UI correctly reflects the sync state even if fallback was used.
