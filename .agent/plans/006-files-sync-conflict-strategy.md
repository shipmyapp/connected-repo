# Plan: Files Sync Conflict Strategy (006)

## Objective
Establish a robust strategy for handling edge cases where frontend data for files (metadata, CDN URLs) needs to sync to the backend.

## Context
Files have asynchronous metadata updates (CDN URLs, thumbnails). We need to handle concurrent edits and partial updates.

## Proposed Strategy
1. **Conflict Resolution**: Determine if "Last Write Wins" or field-level merging is needed for metadata.
2. **Delta Updates**: Differentiate between "Initial Creation" and "Metadata Enrichment" at the API layer.
3. **Safeguards**: Ensure `_pendingAction` stays "create" until fully synced.
4. **Bytea Integration**: Coordinate with the bytea fallback (Plan 005) to ensure consistent state.

## Success Criteria
- Deterministic behavior when syncing metadata from multiple sources.
- No data loss for CDN URLs or thumbnails during concurrent updates.
