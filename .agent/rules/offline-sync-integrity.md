---
trigger: always_on
---

## Offline-First Sync Integrity

To ensure data consistency in an offline-first environment, we follow strict rules for data mutations and synchronization.

1. **Mutation Safety**:
   - **New Data**: Creations are allowed offline first then synced to server.
   - **Existing Data**: Mutations on already-synced data MUST require a server connection or be handled via versioned conflict resolution. NEVER blindly overwrite server state with stale local state.
2. **Server-Time Authority**:
   - **Zero Clock-Skew**: The client never uses its local clock for sync markers.
   - **High-Precision Monotonicity**: The server uses `clock_timestamp()` (near-commit) to prevent "Ghost Gaps".
3. **No-Gap Overlap**: Online mutations return full records and are saved locally for UX, but do NOT advance the `cursorUpdatedAt` pointer. Background sync naturally overlaps these records to ensure no gaps.
4. **Chunk-Level Checkpointing**: Client updates table markers after every successfully stored chunk (100 rows).
5. **SSE Lifecycle**: SSE connections MUST be started only after user authentication and kept running in the background. Stop on logout.
6. **Conflict Vault**: 409 Conflicts are quarantined in the `syncConflicts` table for asynchronous resolution.
7. **Broadcasting**: Use `CHANNELS.DB_UPDATES` to sync state across tabs and workers.