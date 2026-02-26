# Plan: Standardized Sync Patterns (007)

## Objective
Standardize sync state management and introduce server-driven reconciliation.

## Context
Fragile status checks need to be abstracted into unified hooks and server-driven logic.

## Proposed Strategy
1. **Status Abstraction**: Implement `useSyncStatus(id)` hook for high-level states (UPLOADING, SUCCESS, etc.).
2. **ULID Symmetry**: Align ULID generation between Frontend workers and Backend.
3. **State Hashing**: Backend sends state checksum via SSE, triggering a local vs remote diff.

## Success Criteria
- UI uses unified hook for sync states.
- Client and server share common identity via ULIDs.
- Background reconciliation fixes gaps.
