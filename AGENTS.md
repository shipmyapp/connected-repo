# Monorepo Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: Production-ready full-stack TS monorepo with E2E type safety and offline-first delta sync.
**Core Stack**: 
- **Repo**: Turborepo + Yarn
- **Backend**: oRPC + Orchid ORM + PostgreSQL + Redis (rate limits) + pg-tbus + Better Auth
- **Frontend**: React 19 + Vite + TanStack Query + Dexie.js (IndexedDB) + pull-delta sync (no SSE)
- **Packages**: Shared Zod schemas, UI components (MUI)
- **Tooling**: Biome (Tabs, 100 chars, double quotes), knip

**Architecture Patterns**:
- **Bimodal Docs**: `README.md` (Human) vs `AGENTS.md` (Agent)
- **Worker Isolation**: `DataWorker` (DB/Sync) vs `MediaWorker` (Stateless/Uploads)
- **Sync Integrity**: Offline mutations allowed ONLY for unsynced records.
- **Strict TS**: NO `any`, NO `as unknown`, NO `ts-ignore`.

---

## Layer 2: Active Task
- **Objective**: Redis as a required service; rate limits in Redis.
- **Status**: Completed.
- **Context**: Redis 7 runs next to Postgres in both compose files and in CI; the backend requires `REDIS_URL`, opens one ioredis connection on first use and reports it in `/health`. Every rate limit is a Redis token bucket that fails open when Redis is down (ADR-016); the Postgres `rate_limits` table is no longer used and is dropped in a later release.

## Layer 3: Decision Records

| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-001] | Pivot to OneQ | Accepted | App returns to its ultra-minimalist journaling roots. |
| [ADR-002] | Snake Case Columns in Raw SQL | Accepted | Always use snake_case in raw SQL Orchid ORM migrations. |
| [ADR-003] | Hybrid Auth (Cookies + Bearer) | Accepted | Support both web and mobile auth via Better Auth bearer plugin. |
| [ADR-004] | Smart CSRF Exception | Accepted | Exclude Bearer-token requests from CSRF checks for mobile compatibility. |
| [ADR-005] | OPFS Storage Persistence | Accepted | Move binary blobs from IndexedDB to OPFS to prevent browser eviction and improve performance. |
| [ADR-006] | Direct Imports | Accepted | NO barrel exports to ensure optimal tree-shaking. |
| [ADR-007] | Files Metadata Idempotency | Accepted | Use .merge() for files creation to capture asynchronous metadata enrichment. |
| [ADR-008] | Sync Recovery (Lost Files) | Accepted | Flag `isMainFileLost` allows metadata sync even if binary data is purged from storage. |
| [ADR-009] | Virtual Media Provider | Accepted | Serve OPFS media via Service Worker fetch interception to avoid avoid `URL.createObjectURL` overhead. |
| [ADR-010] | Token Bucket Rate Limiting | Superseded by ADR-016 | Was an optimistic-locking token bucket in Postgres (`rate_limits`); the bucket now lives in Redis. |
| [ADR-011] | Pull Bundles Renaming | Accepted | Rename sync table procedures from `pullDelta` to `pullBundles`. |
| [ADR-012] | Backend Security Hardening | Accepted | Implementing strict SSRF guards, dummy hashes for timing attacks, and strict teamId scoping for multitenant safety. |
| [ADR-013] | Novu Push Notifications | Accepted | Implemented FCM token synchronization and notification dispatch using Novu with optimistic DB-first tracking. |
| [ADR-014] | Silent Sync Trigger | Accepted | Implemented FCM silent pushes to wake up the app for background sync, bypassing OS notifications. |
| [ADR-015] | No dead code, as we go | Accepted | Biome (unused imports and variables are errors; the backend's nested config extends the root) runs on staged files in a pre-commit hook; knip (unused files, exports, types, dependencies) and the typecheck run pre-push; CI runs knip and a blocking lint. Hooks live in `.githooks/`, installed by the root `prepare` script. `knip.jsonc` lists the offline-first entries (service worker, data and media workers). Kept features that knip cannot see are taught to it, never deleted. |
| [ADR-016] | Redis required; rate limits in Redis | Accepted | Redis 7 is a required service next to Postgres (`REDIS_URL`), never the source of truth and with no worker, pub/sub or realtime on it. Every rate limit is a token bucket run by one Lua script (`rl:<scope>:<subject>:<id>`, refills at limit/window, expires when full). When Redis fails, limits fail open; `failClosed` is only for a limit that is the sole guard on a guessable secret (none today). `/health` reports `redis: ok/down` with HTTP 200. The `rate_limits` table is unused and dropped in a later release (expand/contract). |

## Quick Reference
- **Dev**: `yarn dev`
- **Build**: `yarn build`
- **Check**: `yarn lint`, `yarn format`, `yarn check-types`, `yarn knip`
- **Hooks** (no dead code, as we go): `yarn install` points git at `.githooks/`. **pre-commit** runs Biome on the staged files (unused imports and variables are errors); **pre-push** runs `yarn knip` (unused files, exports, types, dependencies) and `yarn check-types`; CI runs both and lint. They are clean on `main`, so a red one is yours: remove what the change left unused (an old path a new one replaced, a helper nobody calls, a dependency) rather than exporting it again or skipping the hook. Code of a kept feature that knip cannot see is taught to `knip.jsonc` with a comment, never deleted.
- **DB**: `yarn db g <name>`, `yarn db up`, `yarn db seed`

## Module Deep Dives
- [apps/backend/AGENTS.md](apps/backend/AGENTS.md)
- [apps/frontend/AGENTS.md](apps/frontend/AGENTS.md)
- [packages/AGENTS.md](packages/AGENTS.md)
- [packages/ui-mui/AGENTS.md](packages/ui-mui/AGENTS.md)
- [packages/zod-schemas/AGENTS.md](packages/zod-schemas/AGENTS.md)
