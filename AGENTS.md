# Monorepo Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: Production-ready full-stack TS monorepo with E2E type safety and offline-first delta sync.
**Core Stack**: 
- **Repo**: Turborepo + Yarn
- **Backend**: oRPC + Orchid ORM + PostgreSQL + pg-tbus + Better Auth
- **Frontend**: React 19 + Vite + TanStack Query + Dexie.js (IndexedDB) + SSE
- **Packages**: Shared Zod schemas, UI components (MUI)
- **Tooling**: Biome (Tabs, 100 chars, double quotes)

**Architecture Patterns**:
- **Bimodal Docs**: `README.md` (Human) vs `AGENTS.md` (Agent)
- **Worker Isolation**: `DataWorker` (DB/Sync) vs `MediaWorker` (Stateless/Uploads)
- **Sync Integrity**: Offline mutations allowed ONLY for unsynced records.
- **Strict TS**: NO `any`, NO `as unknown`, NO `ts-ignore`.

---

## 2. Active Task
**Context**: Background Sync (Service Worker) (Plan 011).
**Current Status**: Completed Plan 002 (Storage Persistence). Transitioning to Plan 011 to enable Service Worker based background synchronization via an isomorphic sync engine.
**Intent**: Implement isomorphic `SyncOrchestrator` safe for both DataWorker and Service Worker contexts.

---

## 3. Decision Records
| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-001] | Bimodal Documentation | Accepted | Split human-friendly and agent-optimized docs. |
| [ADR-002] | Worker Isolation | Accepted | Proxy pattern for UI-Worker communication. |
| [ADR-003] | Offline Mutation Safety | Accepted | Synced records require online connection for edits. |
| [ADR-004] | Direct Imports | Accepted | NO barrel exports to ensure optimal tree-shaking. |
| [ADR-005] | Files Metadata Idempotency | Accepted | Use .merge() for files creation to capture asynchronous metadata enrichment. |
| [ADR-006] | Sync Recovery (Lost Files) | Accepted | Flag `isMainFileLost` allows metadata sync even if binary data is purged from storage. |
| [ADR-007] | OPFS Storage Persistence | Accepted | Move binary blobs from IndexedDB to OPFS to prevent browser eviction and improve performance. |
| [ADR-008] | Virtual Media Provider | Accepted | Serve OPFS media via Service Worker fetch interception to avoid avoid `URL.createObjectURL` overhead. |

## Quick Reference
- **Dev**: `yarn dev`
- **Build**: `yarn build`
- **Check**: `yarn lint`, `yarn format`, `yarn check-types`
- **DB**: `yarn db g <name>`, `yarn db up`, `yarn db seed`

## Module Deep Dives
- [apps/backend/AGENTS.md](apps/backend/AGENTS.md)
- [apps/frontend/AGENTS.md](apps/frontend/AGENTS.md)
- [packages/AGENTS.md](packages/AGENTS.md)
- [packages/ui-mui/AGENTS.md](packages/ui-mui/AGENTS.md)
- [packages/zod-schemas/AGENTS.md](packages/zod-schemas/AGENTS.md)
