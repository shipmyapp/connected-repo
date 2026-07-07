# Frontend Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: Offline-capable PWA with worker-isolated storage and pull-based delta sync.
**Core Stack**: React 19, Vite 7, React Router 7, TanStack Query + oRPC, Dexie.js
(per-user), Comlink workers, MUI, Better Auth, Sentry.

**Key Architectures**:
- **Two dedicated workers** (see `src/worker/AGENTS.md`):
  - `DataWorker` — per-user Dexie DB + `SyncOrchestrator` + `FileUploadWorker`.
  - `MediaWorker` — stateless thumbnail generation + CDN uploads.
  Both exposed to the main thread via Comlink (`getDataProxy()`, `getMediaProxy()`).
- **Pull-based delta sync**: two-cursor pull-delta per table, push-creates for the
  offline queue. No SSE, no long-lived socket.
- **Per-user Dexie DB**: `dbNameFor(userId)` — signing in as a different user on
  the same device drops the previous user's DB.
- **Active team = header + worker cache**: the ORPC client stamps `x-team-id` from
  a main-thread cache; the DataWorker and MediaWorker each keep their own copy
  seeded by the main thread on spawn / team switch.

---

## 2. Decision Records
| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-F01] | Comlink proxies | Accepted | Main thread only talks to workers via `getDataProxy()` / `getMediaProxy()`. |
| [ADR-F02] | Per-user Dexie DB | Accepted | `dbNameFor(userId)`; other users' DBs are dropped on user switch. |
| [ADR-F03] | Pull-delta sync (no SSE) | Accepted | Triggers: 120s interval + `visibilitychange` + `focus` + `online` + post-write kicks + FCM silent-push wake. Cycles are throttled to a 2-minute window unless `force: true`. |
| [ADR-F04] | Wave-1 anchor | Accepted | `teams.pullBundles` mints `topLevelSyncedAt`; downstream waves echo it back for a consistent snapshot. |
| [ADR-F05] | Active team header + worker cache | Accepted | Header cache and worker caches flip in lockstep — desync causes "Active team id mismatch." |
| [ADR-F06] | OPFS-backed file uploads | Accepted | Blobs live in OPFS; `FileUploadWorker` drives the CDN pipeline off OPFS paths. |

---

## 3. Technical Guidelines

### Module Structure
```
src/
├── modules/<module>/
│   ├── pages/
│   ├── <module>.router.tsx
│   └── worker/<module>.db.ts   # Dexie adapter, imported by DataWorker
├── worker/                     # See src/worker/AGENTS.md
│   ├── data.worker.ts, media.worker.ts
│   ├── worker.proxy.ts, worker.context.ts
│   ├── db/, cdn/, sync/, utils/
└── utils/
    ├── sync-triggers.ts        # main-thread trigger installer
    ├── active_team_header.client.ts
    └── orpc.client.ts
```

### Worker Access (proxy pattern)
```ts
import { getDataProxy } from "@/worker/worker.proxy";
const entry = await (await getDataProxy()).journalEntriesDb.getById(id);
```
Never `new Worker()` directly outside `worker.proxy.ts`.

### Sync Triggers (main thread)
Installed by `initSyncForUser` in `src/utils/sync-triggers.ts`:
- `visibilitychange` (when tab returns to visible)
- `window` `focus`
- `window` `online`
- 120s interval (2-minute cadence; matches the worker-realm safety net)
- One eager kick right after install
Each trigger calls `sync.processQueue()` on the DataWorker, which is idempotent
(a concurrent trigger sets a rescan bit).

### Active-team Propagation
`setActiveTeam(teamId)` — called by the profile-page switcher — updates in lockstep:
1. `setActiveTeamIdForRequests` (main-thread header cache used by ORPC).
2. `dataProxy.sync.setActiveTeamId(...)` (DataWorker cache; triggers a sync).
3. `mediaProxy.setActiveTeamId(...)` if the media worker is already warm.

### UI Standards
- **Design**: Tasteful, smooth (200-300ms transitions), responsive.
- **Imports**: Direct imports only (NO barrel exports).
- **Responsive**: `xs` for mobile, `md`+ for desktop. Touch targets min 44px.

### Testing
- **E2E**: Playwright tests are state-dependent. Use conditional logic.
