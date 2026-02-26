# Plan: Disaster Recovery Export (010)

## Objective
Provide a "break glass" recovery mechanism for users with pending data.

## Proposed Strategy
1. **Data Export (`.expowiz`)**: ZIP-based format containing JSON metadata and raw binary blobs.
2. **CDN-Direct Fallback**: If backend is down but CDN is up, trigger `MediaWorker` to upload directly and store `cdnUrl` locally.
3. **Restoration Flow**: Import `.expowiz` file into Dexie DB on a different device.

## Success Criteria
- User can trigger a single export download.
- Sync orchestrator can populate CDN URLs locally even when backend is down.
