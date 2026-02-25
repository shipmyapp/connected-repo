# Frontend Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: High-performance, offline-first PWA with strict worker isolation and real-time delta sync.
**Core Stack**: React 19, Vite 7, React Router 7, TanStack Query + oRPC, Dexie.js, MUI, Better Auth, Sentry.

**Key Architectures**:
- **Two-Worker Isolation**: 
    - `DataWorker`: Stateful (Dexie DB, SyncOrchestrator, SSE).
    - `MediaWorker`: Stateless (Image/Video/PDF thumbnails, S3 uploads).
- **Offline-First Sync**: SSE-based delta sync + background `SyncOrchestrator`. 
- **Offline Safety**: Mutations on synced records PROHIBITED offline to prevent complex conflicts.

---

## 2. Active Task
**Context**: Syncing frontend documentation with the monorepo's documentation lifecycle standard.
**Current Status**: Aligning `AGENTS.md` with the 3-layer structure.
**Context**: Debugging blank journal entry detail page (investigating `useLocalDbItem` and ID consistency).

---

## 3. Decision Records
| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-F01] | Comlink Proxy | Accepted | Use `getDataProxy()`/`getMediaProxy()` for worker interaction. |
| [ADR-F02] | Auth Caching | Accepted | LocalStorage fallback for offline session validation. |
| [ADR-F03] | Mobile-First | Accepted | 44x44px touch targets; responsive scaling at `md` breakpoint. |

## Technical Guidelines

### Module Structure
```
src/
├── modules/<module>/
│   ├── pages/
│   ├── <module>.router.tsx
│   └── <module>.spec.ts
├── worker/ (db/, cdn/, sync/)
├── sw/ (sse.manager.sw.ts)
└── utils/ (orpc.client.ts, auth.persistence.ts)
```

### Worker Usage (Proxy Pattern)
```typescript
import { getDataProxy } from '@/worker/worker.proxy';
const entry = await getDataProxy().journalEntriesDb.getById(id);
```

### Offline Constraints
- **Allowed**: `create` unsynced, `delete`/`edit` unsynced.
- **Prohibited**: Mutations on synced records (`_pendingAction === null`).

### Sync Lifecycle (SSE)
- **Init**: Connects on login; receives delta chunks.
- **Run**: Real-time updates via ORM hooks.
- **Watchdog**: 10s heartbeat checks.

### UI Standards
- **Design**: Tasteful, smooth (200-300ms transitions), responsive.
- **Imports**: Direct imports only (NO barrel exports).
- **Responsive**: `xs` for mobile, `md`+ for desktop. Touch targets min 44px.

### Testing
- **E2E**: Playwright tests are state-dependent. Use conditional logic.
