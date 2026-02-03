# Full-Stack TypeScript Monorepo

Production-ready Turborepo monorepo for building full-stack TypeScript applications with end-to-end type safety.

## Tech Stack

### Backend
- **Runtime**: Node.js 22+
- **API Layer**: [oRPC](https://orpc.dev/) (internal APIs) + REST/OpenAPI (external APIs)
- **Database**: PostgreSQL with [Orchid ORM](https://orchid-orm.netlify.app/)
- **Task Queue**: [pg-tbus](https://github.com/hextech-dev/pg-tbus) (PostgreSQL-based event bus)
- **Authentication**: Better Auth (Google OAuth)
- **Notifications**: SuprSend
- **Observability**: OpenTelemetry, Sentry
- **Security**: Helmet, CORS, Rate Limiting, API key auth

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) with SWC
- **Routing**: React Router 7
- **State**: TanStack Query (server), Zustand (global), React Hook Form (forms)
- **UI**: Material-UI (via `@connected-repo/ui-mui`)
- **PWA**: Vite PWA plugin with offline support
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

### Prerequisites
- Node.js 22+
- Yarn 1.22.22
- PostgreSQL

### Installation

1. Clone the repository:
```bash
git clone git@github.com:shipmyapp/connected-repo.git
cd connected-repo
```

2. Set up environment variables:
```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

3. Configure your database connection in `apps/backend/.env`

4. Install dependencies & build packages:
```bash
yarn install
yarn build
```

5. Create databases and run migrations:
```bash
yarn db create
yarn db up
yarn db seed
yarn test:db:setup  # Setup test database
```

### Development

Start both frontend and backend:
```bash
yarn dev
```

Or individually:
```bash
cd apps/backend && yarn dev   # Backend only (http://localhost:3000)
cd apps/frontend && yarn dev  # Frontend only (http://localhost:5173)
```

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
yarn test:e2e          # Run E2E tests
yarn test:e2e -b       # Build before testing
yarn test:e2e:ui       # UI mode
```

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

### Cron Jobs

Per-minute cron jobs using node-cron with mutex locking:

```typescript
// In src/cron_jobs/services/per_minute_cron.ts
cron.schedule('* * * * *', async () => {
  if (isCronJobRunning) return; // Prevent concurrent runs
  await scheduleReminders();
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

### End-to-End Type Safety

Shared Zod schemas in `packages/zod-schemas/`:
- Entity schemas: `<entity>CreateInputZod`, `<entity>UpdateInputZod`, `<entity>SelectAllZod`
- Direct TypeScript imports from backend to frontend
- No code generation required

## Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [AGENTS.md](./AGENTS.md) - Agent guidelines
- [apps/backend/AGENTS.md](./apps/backend/AGENTS.md) - Backend patterns
- [apps/frontend/AGENTS.md](./apps/frontend/AGENTS.md) - Frontend patterns
- [packages/AGENTS.md](./packages/AGENTS.md) - Package architecture

## API Endpoints

- **oRPC APIs**: http://localhost:3000/orpc
- **REST APIs**: http://localhost:3000/api/v1/*
- **Swagger UI**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/api/health
- **Better Auth**: http://localhost:3000/api/auth/*

## License

[AGPL-3.0](./LICENSE) - Copyright (c) 2025 Hexatech Hub Solutions LLP, India
