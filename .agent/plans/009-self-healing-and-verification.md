# Plan: Self-Healing & Verification (009)

## Objective
Ensure the integrity of local and remote file states through proactive verification and automated recovery.

## Proposed Strategy
1. **Verification Engine**: Implement `verifyRecordIntegrity(id)` in `FilesDBManager`.
2. **Checks**: Verify `_blob` readability, checksums, and perform HEAD requests to CDN.
3. **Recovery**: If verification fails, reset stage (e.g., clear `cdnUrl`) to force re-sync.

## Success Criteria
- Inconsistent file states are automatically detected and reset.
- Remote file existence is verified for all synced records.
