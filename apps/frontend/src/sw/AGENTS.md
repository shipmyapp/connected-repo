# Real-time Sync Architecture

This document details the architecture, design choices, and resilience strategies for the real-time synchronization system used in this application.

## Overview

The sync system follows a **Delta-on-Connect** pattern combined with **Real-time Event Monitoring** via Server-Sent Events (SSE). It is managed primarily within the Service Worker (`SSEManager`) to ensure persistence across tab closures and reloads.

## Lifecycle of a Sync Session

1.  **Handshake**: The client initiates the `heartbeatSync` oRPC procedure, sending its local `lastSyncTimestamps` for each table (e.g., `journalEntries`, `prompts`).
2.  **Delta Phase**: The backend calculates the "delta" (missing records) for each table since the provided timestamps.
    *   Data is streamed to the client in chunks.
    *   **Consistency Guard**: If any error occurs during delta generation, the backend yields an error and terminates the procedure immediately.
3.  **Persistence Phase (Client)**: As chunks arrive, the `SSEManager` persists them to the local database (TinyBase).
    *   **Granular Recovery**: Local timestamps are updated *after each chunk*, allowing sync to resume precisely from where it left off if the connection drops.
4.  **Live Monitoring Phase**: Once all deltas are successfully delivered, the backend transitions to the `liveIterator`. The connection remains open to stream real-time broadcasts (upserts/deletes) triggered by backend ORM hooks.

## Design Choices & Resilience Strategies

### 1. Abort-on-Error Strategy
To guarantee absolute data consistency, we implement a strict "Abort-on-Error" policy:
- **Backend**: Aborts the `heartbeatSync` procedure if any table delta fail to generate.
- **Frontend**: The `SSEManager` explicitly calls `abortController.abort()` if any backend-yielded error OR local persistence error is encountered.
- **Rationale**: It is safer to terminate the connection and trigger a clean retry (with backoff) than to continue monitoring and risk entering a "live" state with data gaps.

### 2. Service Worker Orchestration
The `SSEManager` resides in the Service Worker. This centralizes the connection, preventing redundant SSE streams across multiple tabs and ensuring sync continues even if the main UI is busy or closed.

### 3. Granular Error Statuses
We distinguish between three primary failure modes to provide better UI feedback:
- `auth-error`: Triggered by `401 Unauthorized`. Monitoring stops automatically until the user logs in again.
- `sync-error`: Triggered by failures during the Delta/Persistence phase.
- `connection-error`: Triggered by network drops or server unreachability.

## UI Integration

The `useConnectivity` hook maps these granular worker statuses to human-readable states:
- **`✓✓` (Double Tick)**: Success status (`sync-complete`).
- **`!` (Exclamation Mark)**: Error status (Sync/Auth/Connection issues).
- **Descriptive Messages**: "Session Expired", "Sync Issue", or "No Internet" based on the specific failure code.

## File Reference
- **Backend Logic**: `apps/backend/src/modules/sync/sync.router.ts`
- **Frontend Manager**: `apps/frontend/src/sw/sse/sse.manager.sw.ts`
- **UI Hook**: `apps/frontend/src/sw/sse/useConnectivity.sse.sw.ts`
- **UI Component**: `apps/frontend/src/sw/sse/StatusBadge.sse.sw.tsx`
