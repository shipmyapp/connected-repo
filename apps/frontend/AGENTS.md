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
| [ADR-F07] | Theme on the account | Accepted | Light / Dark / System is `users.theme_setting`, written by `useSaveThemeSetting` through `authClient.updateUser` (better-auth refreshes its cookie) and patched into the offline auth cache; `AppLayout` applies the loader's value. `ThemeContext`'s setters are stable: an effect that depends on them must not re-run after every theme change. Toasts take `actualMode`, never the setting. |
| [ADR-F08] | Destructive acts are confirmed | Accepted | Every act that deletes or removes asks first through `ConfirmDialog` (`@connected-repo/ui-mui/components/ConfirmDialog`): Cancel left, the act red and named for what it does, no dismissal while it runs. |
| [ADR-F09] | Dialogs are drawers | Accepted | The theme docks every MUI `Dialog` to the bottom on phones and the right edge from `md`; write new dialogs as plain `Dialog`s. Fields type at 16 px on touch screens (no iOS zoom); pinch-zoom stays. |
| [ADR-F10] | Errors have pages | Accepted | `AppErrorBoundary` (ui-mui) is the top-level net and never calls `useRouteError()`; route errors render `ErrorScreen` via `components/error_fallback.tsx`. A page restored from the back/forward cache reloads (`pageshow` in `main.tsx`). |
| [ADR-F11] | Times read relative | Accepted | Past and planned times show through `<When at={ms} />` ("5 min ago", one shared ticker, the exact time on hover); positions inside a recording stay exact. |
| [ADR-F12] | Back closes what it opened | Accepted | Every dialog or sheet without an address of its own calls `useBackCloses(open, onClose)` (`@connected-repo/ui-mui/utils/use_back_closes`; `ConfirmDialog` does it for you). While open it holds one same-URL history entry; Back pops it and closes the overlay (React Router re-runs the matched loaders: one session read online, the cached user offline). |
| [ADR-F13] | The profile page is the account hub | Accepted | The avatar is a plain link to `/profile`; there is no account menu. Teams are listed, switched and created only in `modules/teams/components/TeamsCard.tsx` on the profile page; the navbars show the active team's name as text. Sign out, theme and per-device settings are profile cards. |
| [ADR-F14] | Leave history clean around sign-in | Accepted | Sign-in (test mode) and sign-out navigate with `location.replace`, so Back never returns to the page just left; a failed sign-in start is shown under the button and sent to Sentry; test-only fixtures are imported dynamically inside the test branch. |

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
4. The cached user is patched (`patchAuthCacheUser`) and `requestFreshSession()` makes the awaited revalidation read the session past better-auth's cookie cache; the gate reopens after it.

### Team hosts (`src/tenant/`)
- `tenant.resolver.ts`: the slug from the hostname (`VITE_TENANT_ROOT_DOMAIN`); branding through `teams.getBrandingBySlug` with `context: { noTeam: true }`; localStorage cache `tenant_branding_cache:<slug>`; `sharedAppUrl()` for links back to the shared app.
- `TenantContext.tsx`: `applyDocumentBranding` is the only code touching the manifest link, `theme-color` and the icons. Install UI reads its name and icon from `useTenant().brand`, never from literals.
- `TenantGate` holds the router until branding is known (a cached copy counts: offline boot).
- `authLoader`'s `enforceTenantTeam` locks the session copy to the host's team (never `teams.setActiveTeam`) and sends a non-member to `/auth/no-access`; `tenant.lock.ts` decides whether a cached session may boot offline.
- RPC context `noTeam`: skips the seed wait and the switch gate and sends no `x-team-id`, in both realms. Use it only for public or session-only procedures.
- Dev: `VITE_TENANT_ROOT_DOMAIN=localhost` and `TENANT_ROOT_DOMAIN=localhost`, a team with a slug, then `http://<slug>.localhost:5173` in Chrome. Google sign-in cannot finish on a team host in dev (host-only cookies on localhost).

### UI Standards
- **Design**: Tasteful, smooth (200-300ms transitions), responsive.
- **Imports**: Direct imports only (NO barrel exports).
- **Responsive**: `xs` for mobile, `md`+ for desktop. Touch targets min 44px.

### Testing
- **Unit**: `yarn workspace @connected-repo/frontend test:run`. Node by default (worker/db logic, utils); a component test starts with `// @vitest-environment jsdom` and renders through `renderWithTheme` (`src/test/render.tsx`).
- **E2E**: Playwright tests are state-dependent. Use conditional logic.
