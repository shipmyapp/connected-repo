# Full-Stack TypeScript Monorepo

Production-ready Turborepo monorepo for building full-stack TypeScript applications with end-to-end type safety. It ships a working app (a team journal, "OneQ") that keeps working offline and syncs when it can, lets each team run it on its own branded host, gives operators a console with an audit trail, and lets a person connect their AI apps to their account through an OAuth-protected MCP server. Fork it, rename it, and replace the journal with your own features.

**What it does out of the box**

- **Offline-first sync**: the app reads and writes a local database (Dexie, OPFS for files) in a worker and pulls changes from the server per table; writes made offline are pushed when the device is back online.
- **Teams**: every account has a personal team and can create or join shared ones, with Owner, Admin and Member roles enforced on the server.
- **The journal demo**: journal entries with prompts, attachments (thumbnails made in a worker) and reminders.
- **The API product**: per-team API keys, subscriptions with request quotas, request logs, usage webhooks and an OpenAPI reference.
- **Team hosts**: a team with a subdomain (`<slug>.<root>`, assigned by an operator) gets its own installable, branded app locked to that team.
- **Install flow and device record**: an install offer that works on Chromium, iPhone and Mac Safari, and one record per device and account for installs, push permission and push address.
- **Notifications**: in-app inbox, push and email through Novu; workflows kept in code and in the Novu dashboard, the newer winning at boot.
- **Operator console** (`apps/superadmin`): teams, members, users, feature flags and account deletions, every change written to an operator audit trail that the console lists.
- **Application MCP**: a person's AI apps connect at `/mcp` with OAuth (consent page, scopes, revocable from the profile) and work through the app's own procedures.
- **Account lifecycle**: a person sees and ends their signed-in sessions, downloads their data, and deletes their account with a 30-day grace period (after leaving or deleting their teams).

> [!NOTE]
> This project follows a **Bimodal Documentation System**.
> - **Human-friendly**: Use this `README.md` for high-level concepts, architectural overviews, and onboarding.
> - **Agent-optimized**: See [AGENTS.md](./AGENTS.md) for technical deep dives, implementation patterns, and machine-centric decision records.

## Tech Stack

### Backend
- **Runtime**: Node.js 26 (`engines.node` `>=26`)
- **API Layer**: [oRPC](https://orpc.dev/) (internal APIs) + REST/OpenAPI (external APIs)
- **Database**: PostgreSQL 18 with [Orchid ORM](https://orchid-orm.netlify.app/)
- **Redis**: Redis 8, required (rate limits and ended-session marks; never the source of truth)
- **Task Queue**: [pg-tbus](https://github.com/hextech-dev/pg-tbus) (PostgreSQL-based event bus)
- **Authentication**: Better Auth 1.7 (Google on the web; Google and Apple on mobile through the bearer plugin; also the OAuth provider for connected AI apps)
- **Notifications**: Novu (in-app inbox, FCM push, email); workflows kept in code and in the Novu dashboard, the newer winning at boot
- **Observability**: Sentry 11 (errors, traces with the HTTP, oRPC, Postgres and Redis spans, profiles, logs), with an explicit data-collection allow list. Sentry owns tracing: there is no OpenTelemetry SDK or exporter of our own; the app's own spans go through `@opentelemetry/api`. Self-hosted Sentry must be 26.4.2 or later. The operator console sends nothing to Sentry.
- **Security**: security headers, CORS, rate limiting (Redis token buckets), API key auth, CSRF checks, request body limits

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) with SWC
- **Routing**: React Router 8
- **State**: TanStack Query (server), Zustand (global), React Hook Form (forms)
- **UI**: Material-UI (via `@connected-repo/ui-mui`)
- **PWA**: Vite PWA plugin with offline support
- **Offline Storage**: Dexie.js (IndexedDB wrapper)
- **Sync**: Pull-based two-cursor delta sync + FCM silent-push wake (no SSE)
- **Workers**: Two-worker architecture (DataWorker + MediaWorker)
- **Testing**: Vitest (unit and component), Playwright (E2E)

### Tooling
- **Monorepo**: [Turborepo](https://turbo.build/repo)
- **Package Manager**: Yarn 1.22.22
- **Linting**: Biome (tabs, 100 chars, double quotes)
- **TypeScript**: 7 (the native compiler), strict mode. Editors: see [CONTRIBUTING.md](CONTRIBUTING.md#editor-setup)

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
│   ├── frontend/                   # React + Vite
│   │   ├── src/
│   │   │   ├── modules/            # Feature modules
│   │   │   ├── worker/             # Web Workers (DataWorker, MediaWorker)
│   │   │   ├── sw/                 # Service Worker (PWA shell, FCM push, OPFS media)
│   │   │   ├── components/         # Shared components
│   │   │   └── main.tsx            # Entry
│   │   └── package.json
│   └── superadmin/                 # Operator console (React + Vite SPA)
├── packages/
│   ├── typescript-config/          # Shared TS configs
│   ├── ui-mui/                     # Material-UI components and web pieces both apps share
│   └── zod-schemas/                # Shared Zod schemas and rules
├── deploy/                         # Dokploy env files and per-service settings (deploy/README.md)
├── docs/
│   ├── runbooks/                   # Sentry, connected apps, account deletion, launch checklist
│   └── legal/                      # Placeholder Terms and Privacy texts a fork replaces
├── scripts/                        # check:deploy, check:sentry, the image check
├── .agent/                         # Agent rules, skills and workflows
├── .githooks/                      # pre-commit (Biome) and pre-push (knip, type check)
├── docker-compose.dev.yml          # Local dev stack
├── docker-compose.prod.yml         # Production and staging (Dokploy Compose)
└── turbo.json
```

## Getting Started

Two ways to run: one-command Docker Compose (recommended for onboarding) or
host-mode with your local Node/Postgres (recommended for day-to-day work with
native tooling).

### Option A — One command with Docker Compose (recommended for first run)

Boots postgres, redis, backend (hot reload), frontend (hot reload), the
superadmin console (hot reload, http://localhost:5175) and an nginx sidecar
that mirrors the prod reverse-proxy layout (`/api/*`, `/mcp` → backend, `/` →
SPA). First boot builds the shared packages, auto-creates the database, runs
migrations, and seeds.

**Prerequisites:** Docker + Docker Compose v2.

```bash
git clone git@github.com:shipmyapp/connected-repo.git
cd connected-repo
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp apps/superadmin/.env.example apps/superadmin/.env
docker compose -f docker-compose.dev.yml up
```

Open http://localhost:8080 — same-origin routing exactly like prod. See
`docker-compose.dev.yml` for the full port map and the wipe-and-reset flow
(`down -v`).

### Option B — Host-mode dev

**Prerequisites:** Node.js 26 (the root `package.json` says `engines.node` `>=26`; `.nvmrc` and the Dockerfiles' `NODE_VERSION` say 26), Yarn 1.22.22, PostgreSQL 18 and Redis 8 running locally (or `docker compose -f docker-compose.dev.yml up postgres redis`). The defaults in `apps/backend/.env.example` expect Postgres on `localhost:5432` with user and password `postgres`, and Redis on `localhost:6379`.

```bash
git clone git@github.com:shipmyapp/connected-repo.git
cd connected-repo
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
cp apps/superadmin/.env.example apps/superadmin/.env
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

- Superadmin console: http://localhost:5175 (`yarn dev` starts it too; put your Google account's address in `SUPER_ADMIN_EMAILS` in `apps/backend/.env`. Its origin is already in the example's `ALLOWED_ORIGINS`.)
- Team hosts: set `TENANT_ROOT_DOMAIN=localhost` in `apps/backend/.env` and `VITE_TENANT_ROOT_DOMAIN=localhost` in `apps/frontend/.env`, give a team a subdomain in the console (for example `team1`), then open http://team1.localhost:5173 in Chrome. Google sign-in cannot finish on a team host in dev (cookies on `localhost` are host-only): sign in on the shared app.
- Sign-in needs a Google OAuth web client: set `GOOGLE_WEB_CLIENT_ID` and `GOOGLE_WEB_CLIENT_SECRET`, with the redirect URI `http://localhost:5173/api/auth/callback/google`.

## Starting a new project from this template

1. **Rename the package scope and the app.** The scope `@connected-repo/` is in every `package.json` `name` and in the imports. The app's name ("OneQ") is in: the manifest `name` / `short_name` in `apps/frontend/vite.config.ts`; `<title>` in `apps/frontend/index.html` and `apps/superadmin/index.html`; `DEFAULT_APP_BRAND` in `packages/zod-schemas/src/tenant.utils.ts` (must match the first two); `INSTALL_COPY.appName` in `apps/frontend/src/components/pwa/install.copy.ts`; the console's header in `apps/superadmin/src/components/AdminLayout.tsx` and `pages/Login.page.tsx`; `APP_DISPLAY_NAME`, `USER_MCP_SERVER_NAME` and the `oneq_at_` / `oneq_rt_` token prefixes in `apps/backend/src/modules/user_mcp/oauth.user_mcp.config.ts`; the metadata fetcher's `USER_AGENT` in `apps/backend/src/modules/user_mcp/services/fetch_remote.user_mcp.service.ts`; `deploy/mcp-registry/server.json`. The device cookie is `DEVICE_COOKIE` (`app_device`) in `apps/backend/src/modules/devices/device_cookie.devices.middleware.ts`.
2. **Keep or delete the journal demo.** It lives in the `journal-entries` and `prompts` modules of the backend and the frontend, their tables and sync waves, and the MCP's journal tools. Keep the teams, files, devices, notifications, account and API-product modules: the rest of the template builds on them.
3. **Set the env values.** Copy the three `.env.example` files (above) for development; for a deployment start from `deploy/prod.env.example` / `deploy/staging.env.example` (see `deploy/README.md`). Replace the placeholder Terms and Privacy texts in `docs/legal/`.

## Available Scripts

### Development
- `yarn dev` - Start all apps in watch mode (backend :3000, frontend :5173, console :5175)
- `yarn build` - Build all apps and packages
- `yarn lint` - Run Biome linter
- `yarn format` - Format code with Biome
- `yarn check-types` - Type check all workspaces
- `yarn knip` - Unused files, exports and dependencies
- `yarn check:deploy` - The env schemas, example files, build args, compose and deploy files agree
- `yarn check:sentry` - After `yarn build`: starts the built backend against a local stand-in for Sentry and checks what it sends
- `yarn clean` - Remove node_modules and build artifacts

### Database
- `yarn db create` - Create the database named in `apps/backend/.env`
- `yarn db g <name>` - Generate migration
- `yarn db up` - Run migrations
- `yarn db seed` - Seed database
- `yarn test:db:setup` - Setup test database

### Testing

**Unit and component tests (Vitest), every workspace:**
```bash
yarn test:db:setup     # Once, and after a new migration: the test database
yarn test:run          # Run once
yarn test              # Watch mode
yarn test:ui           # UI mode (backend)
yarn test:coverage     # Coverage report (backend)
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
- Routes: `/api/user-app/*` (the app), `/api/super-admin/*` (the console)
- Example: `orpc.moduleName.create.useMutation()`

**REST/OpenAPI for External APIs:**
- Scalar API reference at `/api/` and the spec at `/api/spec.json` (development and staging; production serves neither)
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
- PDF thumbnail rendering (pdfjs-dist 6: Chrome 125+, Safari 18+; an older browser attaches the PDF without a thumbnail)
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

## Deployment

Production and staging run on Dokploy, either as one **Compose** app (`docker-compose.prod.yml`) or as one **Application** per service built from its own Dockerfile (`deploy/dokploy/`). All three images share one dependency install on the build server. Setup, environment files, the wildcard certificate for team hosts, updates and rollback: [`deploy/README.md`](deploy/README.md). Before launch: [`docs/runbooks/launch-checklist.md`](docs/runbooks/launch-checklist.md).

## What changed in 2.0

2.0.0 is a breaking release for anyone who deploys the template: Redis is required, the runtime is Node 26, the deploy files changed, and the email and phone sign-in doors are closed outside tests. The full list of changes and the steps for upgrading a 1.x deployment are in [CHANGELOG.md](./CHANGELOG.md) under 2.0.0 ("Upgrading from 1.x"). Defects of 1.x that 2.0 fixes, among others:

- Team-API id columns were typed `uuid` though the ids are ULIDs (`subscriptions`, `api_product_request_logs`, `pg_tbus_task_log`).
- The subscription SKU filter was ignored.
- The Google native client-id hook never ran.
- Indexes drifted between the table classes and the database.
- The committed OpenAPI file was stale (now checked in CI by `check:openapi`).
- The `zod-schemas` package imported itself through its own alias.
- A Google sign-in that could not start failed silently.
- The time zone fell back to a plain-HTTP third-party lookup.
- The `test-push` workflow did not exist and the journal fan-out query never ran.
- Install did nothing on Chromium.
- The client address was taken from a header the client could choose.
- Email + password sign-up and phone-code sign-in were open in production; email + password now works only in tests.
- The dashboard's first-run redirect could replace a navigation the person had just started.

## Documentation

- [Root Architecture & ADRs](./AGENTS.md)
- [Backend Patterns](./apps/backend/AGENTS.md)
- [Frontend PWA & Workers](./apps/frontend/AGENTS.md)
- [Operator console](./apps/superadmin/AGENTS.md)
- [UI Component System](./packages/ui-mui/AGENTS.md)
- [Schema Management](./packages/zod-schemas/AGENTS.md)
- [Deployment](./deploy/README.md) and the [runbooks](./docs/runbooks/)
- [CHANGELOG.md](./CHANGELOG.md) - Releases, with the notes for upgrading from 1.x
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines

## API Endpoints

In host-mode dev the backend listens on :3000 and the frontend's Vite server proxies `/api/*`, `/mcp` and the OAuth `/.well-known/*` documents to it.

- **oRPC APIs**: http://localhost:3000/api/user-app/*
- **REST APIs**: http://localhost:3000/api/v1/*
- **API reference (Scalar)**: http://localhost:3000/api/
- **Health Check**: http://localhost:3000/health
- **Better Auth**: http://localhost:3000/api/auth/*
- **Application MCP**: http://localhost:3000/mcp (OAuth bearer tokens only)

## License

[AGPL-3.0](./LICENSE) - Copyright (c) 2025 Hexatech Hub Solutions LLP, India
