# Full-Stack TypeScript Monorepo

Production-ready Turborepo monorepo for building full-stack TypeScript applications with end-to-end type safety.

> [!NOTE]
> This project follows a **Bimodal Documentation System**.
> - **Human-friendly**: Use this `README.md` for high-level concepts, architectural overviews, and onboarding.
> - **Agent-optimized**: See [AGENTS.md](./AGENTS.md) for technical deep dives, implementation patterns, and machine-centric decision records.

## Tech Stack

### Backend
- **Runtime**: Node.js 22+
- **API Layer**: [oRPC](https://orpc.dev/) (internal APIs) + REST/OpenAPI (external APIs)
- **Database**: PostgreSQL with [Orchid ORM](https://orchid-orm.netlify.app/)
- **Task Queue**: [pg-tbus](https://github.com/hextech-dev/pg-tbus) (PostgreSQL-based event bus)
- **Authentication**: Better Auth (Google OAuth)
- **Notifications**: Novu (in-app inbox + FCM push)
- **Observability**: OpenTelemetry, Sentry
- **Security**: Helmet, CORS, Rate Limiting, API key auth

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) with SWC
- **Routing**: React Router 7
- **State**: TanStack Query (server), Zustand (global), React Hook Form (forms)
- **UI**: Material-UI (via `@connected-repo/ui-mui`)
- **PWA**: Vite PWA plugin with offline support
- **Offline Storage**: Dexie.js (IndexedDB wrapper)
- **Sync**: Pull-based two-cursor delta sync + FCM silent-push wake (no SSE)
- **Workers**: Two-worker architecture (DataWorker + MediaWorker)
- **Testing**: Playwright (E2E)

### Tooling
- **Monorepo**: [Turborepo](https://turbo.build/repo)
- **Package Manager**: Yarn 1.22.22
- **Linting**: Biome (tabs, 100 chars, double quotes)
- **TypeScript**: v5.9.x strict mode

## Project Structure

```
.
├── apps/
│   ├── backend/                    # oRPC server
│   │   ├── src/
│   │   │   ├── modules/            # Feature modules
│   │   │   ├── routers/            # Route organization
│   │   │   ├── procedures/         # oRPC procedures
│   │   │   ├── db/                 # Database layer
│   │   │   ├── events/             # pg-tbus events & tasks
│   │   │   ├── cron_jobs/          # Cron job handlers
│   │   │   └── server.ts           # Entry point
│   │   └── package.json
│   └── frontend/                   # React + Vite
│       ├── src/
│       │   ├── modules/            # Feature modules
│       │   ├── worker/             # Web Workers (DataWorker, MediaWorker)
│       │   ├── sw/                 # Service Worker (PWA shell, FCM push, OPFS media)
│       │   ├── components/         # Shared components
│       │   └── main.tsx            # Entry
│       └── package.json
├── packages/
│   ├── typescript-config/          # Shared TS configs
│   ├── ui-mui/                   # Material-UI components
│   └── zod-schemas/              # Shared Zod schemas
└── turbo.json
```

## Getting Started

Two ways to run: one-command Docker Compose (recommended for onboarding) or
host-mode with your local Node/Postgres (recommended for day-to-day work with
native tooling).

### Option A — One command with Docker Compose (recommended for first run)

Boots postgres, backend (hot reload), frontend (hot reload), and an nginx
sidecar that mirrors the prod reverse-proxy layout (`/api/*` → backend,
`/` → SPA). First boot builds the shared packages, auto-creates the database,
runs migrations, and seeds.

**Prerequisites:** Docker + Docker Compose v2.

```bash
git clone git@github.com:shipmyapp/connected-repo.git
cd connected-repo
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
docker compose -f docker-compose.dev.yml up
```

Open http://localhost:8080 — same-origin routing exactly like prod. See
`docker-compose.dev.yml` for the full port map and the wipe-and-reset flow
(`down -v`).

### Option B — Host-mode dev

**Prerequisites:** Node.js 22+, Yarn 1.22.22, PostgreSQL running locally.

```bash
git clone git@github.com:shipmyapp/connected-repo.git
cd connected-repo
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
# Point apps/backend/.env at your local postgres, then:
yarn install
yarn build
yarn db create && yarn db up && yarn db seed
yarn test:db:setup  # Setup test database
yarn dev
```

`yarn dev` starts frontend on http://localhost:5173 and backend on :3000. Vite
proxies `/api/*` to :3000 so the SPA hits the same origin it does in prod —
no separate backend URL, no CORS in dev. Set `VITE_DEV_BACKEND_PROXY_TARGET`
in `apps/frontend/.env` if your backend runs somewhere else.

## Available Scripts

### Development
- `yarn dev` - Start all apps in watch mode
- `yarn build` - Build all apps and packages
- `yarn lint` - Run Biome linter
- `yarn format` - Format code with Biome
- `yarn check-types` - Type check all workspaces
- `yarn clean` - Remove node_modules and build artifacts

### Database
- `yarn db g <name>` - Generate migration
- `yarn db up` - Run migrations
- `yarn db seed` - Seed database
- `yarn test:db:setup` - Setup test database

### Testing

**Backend (Vitest):**
```bash
yarn test              # Run unit tests
yarn test:ui           # UI mode
yarn test:coverage     # Coverage report
```

**Frontend E2E (Playwright):**
```bash
yarn test:e2e:no-build      # Run E2E — assumes dist/ is a warm test-mode build
yarn test:e2e:with-build    # Build the frontend in test mode, then run E2E (safe default)
yarn test:e2e:ui:no-build   # Same, but Playwright UI mode
yarn test:e2e:ui:with-build
```

There is deliberately no bare `test:e2e` — pick your intent explicitly. `:with-build`
is what you want on a fresh clone, after switching branches, or any time the
frontend `dist/` might have been built in the wrong mode. `:no-build` is the
fast-iterate path once a test-mode build is in place.

## Key Features

### Dual API Architecture

**oRPC for Internal APIs:**
- Type-safe APIs for frontend-backend communication
- Zero code generation - types flow automatically
- Routes: `/orpc/*`
- Example: `orpc.moduleName.create.useMutation()`

**REST/OpenAPI for External APIs:**
- Automatic Swagger documentation at `/api`
- OpenAPI 3.1.0 spec from Zod schemas
- Routes: `/api/v1/*`
- Full middleware: API key auth, rate limiting, CORS, IP whitelist, subscription tracking

### Event-Driven Architecture (pg-tbus)

PostgreSQL-based event bus for background tasks and notifications:

```typescript
// Define event
export const userCreatedEventDef = defineEvent({
  event_name: "user.created",
  schema: Type.Object({ userId: Type.String() }),
});

// Define task
export const notificationTaskDef = defineTask({
  task_name: "send_notification",
  schema: Type.Object({ userId: Type.String(), message: Type.String() }),
  config: { retryLimit: 3, retryDelay: 10, retryBackoff: true },
});

// Emit event
tbus.emit(userCreatedEventDef, { userId: "123" });

// Register task handler
tbus.registerTask(notificationTaskDef, async ({ input }) => {
  await sendNotification(input.userId, input.message);
});
```

### PWA (Progressive Web App)

Frontend includes PWA support:
- Offline functionality with service worker
- Install prompts for iOS and Android
- Update prompts for new versions
- Offline blocker UI when connection is lost

### Offline-First Architecture

Full offline support with Dexie.js (IndexedDB):

**Data Synchronization:**
- **Delta Sync**: Pull-based two-cursor delta sync per table (no SSE, no long-lived socket). Triggered by a 2-minute interval, `visibilitychange`/`focus`/`online` events, post-write kicks, and FCM silent-push wake.
- **Local Database**: IndexedDB with separate tables for synced data and pending changes
- **Reactive UI**: Hooks automatically re-render when local DB changes
- **Conflict Resolution**: Soft deletes (tombstones), server-wins for conflicts

**Worker Architecture:**
```
UI Thread (React)
  ├─► DataWorker (Dexie DB, SyncOrchestrator, FileUploadWorker/CDN)
  └─► MediaWorker (stateless thumbnail generation)
```

**File Uploads:**
- S3 presigned URLs for direct browser-to-S3 uploads
- File blobs cached in IndexedDB for offline access
- Automatic sync when connection restored

### Two-Worker Architecture

**DataWorker**: Handles all IndexedDB access and sync
- Dexie.js database operations
- SyncOrchestrator for background pull-delta sync + push queue
- FileUploadWorker: the sole CDN upload path (presigned PUT from the DataWorker realm)
- Only worker allowed to access IndexedDB

**MediaWorker**: Stateless processing worker
- Image thumbnail generation (browser-image-compression)
- PDF thumbnail rendering (pdfjs-dist)
- Returns derived thumbnail blobs to the caller — never persists, never uploads

> Note: video thumbnails currently run on the main thread (`VideoDecoder`/`<video>` need a DOM runtime).

**Communication**: Comlink proxy pattern; the MediaWorker proxy is bridged into the DataWorker for thumbnail generation.

### Delta Sync (pull-based)

There is **no SSE** and no server push channel. The client pulls changes on a schedule and on demand:

**Backend**: each synced table exposes a `pullBundles` procedure backed by the generic
two-cursor `syncDeltaService` (`toCursor` catches up on new rows, `fromCursor`
backfills history). A wave-1 anchor (`teams.pullBundles`) mints a `topLevelSyncedAt`
snapshot ceiling that every downstream wave echoes back for a consistent snapshot.
Soft-deleted rows are shipped as tombstones so the client can evict them.

**Frontend** (DataWorker `SyncOrchestrator`): runs a pull → wipe → push cycle. Triggers:
- 2-minute interval (main-thread + worker-realm safety net)
- `visibilitychange` / `focus` / `online` events
- post-write kicks (a staged file starts its upload immediately)
- FCM **silent push**, which wakes the app to run a sync without showing a notification

### Cron Jobs

Per-minute cron jobs using node-cron, made single-flight with a **Postgres advisory
lock** (not an in-process flag — the lock is safe across multiple app replicas):

```typescript
// e.g. src/cron_jobs/schedule_reminders.cron.ts
cron.schedule("* * * * *", async () => {
  // pg_try_advisory_xact_lock inside a transaction; a second replica that
  // fails to acquire the lock simply skips this tick.
  await withAdvisoryLock(LOCK_KEY, async () => {
    await scheduleReminders();
  });
});
```

### Webhook Processing

Automated webhook queue with retry logic:
- Webhooks triggered at 90% subscription usage
- pg-tbus handles retries with exponential backoff
- Audit logging via `pg_tbus_task_log` table

### Database Migrations

**CRITICAL**: Always auto-generate migrations:

```bash
yarn db g <migration_name>   # Generate only
yarn db up                   # Apply migrations
```

**CRITICAL: Deployment & Compatibility Standards**

Zero-downtime deployments require strict adherence to the following rules. Breaking these is considered a P0 blocker.

#### 1. Database Migrations
* **Additive Only:** All migrations must be additive. Never rename or drop a column/table in a single deployment.
* **Nullable Columns:** New columns must be nullable or have a default value to avoid breaking the existing backend that doesn't know they exist yet.
* **Two-Step Deletion:** To remove a field:
1. Deploy code that stops using the field.
2. In a *subsequent* release, deploy the migration to drop it.

#### 2. API Versioning & Contracts
* **N-1 Compatibility:** The current Backend must support the previous version of the Frontend.
* **No Breaking Payload Changes:** Do not remove fields from JSON responses or change data types (e.g., String to Int) without a version bump (e.g., `/v1/` to `/v2/`).
* **Graceful Failure:** Agents/Frontends must ignore unknown keys in API responses rather than crashing.

### Dual Team Model

Separate teams for UI and API access:

| Aspect | teams_app (UI) | teams_api (External) |
|--------|---------------|---------------------|
| **Auth** | Session/Cookie | API Key |
| **Use Case** | Journal entries, prompts | Webhook integrations |
| **Tables** | `teams_app`, `team_members` | `teams_api` |

### End-to-End Type Safety

Shared Zod schemas in `packages/zod-schemas/`:
- Entity schemas: `<entity>CreateInputZod`, `<entity>UpdateInputZod`, `<entity>SelectAllZod`
- Direct TypeScript imports from backend to frontend
- No code generation required

## Documentation

- [Root Architecture & ADRs](./AGENTS.md)
- [Backend Patterns](./apps/backend/AGENTS.md)
- [Frontend PWA & Workers](./apps/frontend/AGENTS.md)
- [UI Component System](./packages/ui-mui/AGENTS.md)
- [Schema Management](./packages/zod-schemas/AGENTS.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines

## API Endpoints

- **oRPC APIs**: http://localhost:3000/orpc
- **REST APIs**: http://localhost:3000/api/v1/*
- **Swagger UI**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/api/health
- **Better Auth**: http://localhost:3000/api/auth/*

## License

[AGPL-3.0](./LICENSE) - Copyright (c) 2025 Hexatech Hub Solutions LLP, India
