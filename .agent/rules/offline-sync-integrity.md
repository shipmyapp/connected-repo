---
trigger: always_on
---

## Offline-First Sync Integrity

To ensure data consistency in an offline-first environment, we follow strict rules for data mutations and synchronization.

1. **Mutation Safety**:
   - **New Data**: Creations are allowed offline first then synced to server. Subsequent edits to these pending records are also allowed offline.
   - **Synced Data**: Mutations (updates/deletes) on already-synced data MUST require an active server connection. Offline edits to synced records are strictly prohibited to ensure simplicity and data integrity.
2. **Server-Time Authority**:
   - **Zero Clock-Skew**: The client never uses its local clock for sync markers.
   - **High-Precision Monotonicity**: The server uses `clock_timestamp()` (near-commit) to prevent "Ghost Gaps".
3. **No-Gap Overlap**: Online mutations return full records and are saved locally for UX, but do NOT advance the `cursorUpdatedAt` pointer. Background sync naturally overlaps these records to ensure no gaps.
4. **Cursor-Level Checkpointing**: Client updates table markers (`cursorUpdatedAt`, `cursorId`) after every successfully stored chunk or heartbeat transition.
5. **SSE Lifecycle**: SSE connections MUST be started only after user authentication and kept running in the background. Stop on logout.
6. **Direct Deletion**: Synced records are deleted directly from both server and local DB upon successful online confirmation. No local "shadow" deletion markers are required for synced entries.
7. **Broadcasting**: Use `CHANNELS.DB_UPDATES` to sync state across tabs and workers.