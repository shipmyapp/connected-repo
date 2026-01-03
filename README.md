# Full-Stack TypeScript Monorepo

Production-ready Turborepo monorepo for building full-stack TypeScript applications with end-to-end type safety. Includes a complete reference implementation of a Scheduled Prompt & Journal app.

## Tech Stack

### Backend
- **Runtime**: Node.js 22+
- **Framework**: [Fastify](https://fastify.dev/) - Fast and low overhead web framework
- **API Layer**:
  - [oRPC](https://orpc.dev/) - End-to-end typesafe APIs for internal/frontend communication
  - REST/OpenAPI - External product APIs with automatic Swagger documentation
- **Database**: PostgreSQL with [Orchid ORM](https://orchid-orm.netlify.app/)
- **API Gateway**: API key authentication, rate limiting, CORS validation, IP whitelisting, subscription management
- **Observability**: OpenTelemetry integration, Sentry for error tracking and RUM
- **Security**: Helmet, CORS, Rate Limiting, Better Auth (Google OAuth)
- **Deployment**: Docker support with automated migrations

### Frontend
- **Framework**: [React 19](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Routing**: React Router
- **Data Fetching**: [TanStack Query](https://tanstack.com/query) + oRPC Client
- **Type Safety**: Direct TypeScript imports from backend

### Tooling
- **Package Manager**: Yarn (v1.22.22)
- **Monorepo**: [Turborepo](https://turbo.build/repo)
- **Linting/Formatting**: Biome (tabs, 100 chars, double quotes)
- **TypeScript**: v5.8.x with strict mode
- **Testing**: Vitest (backend), Playwright (frontend E2E)

## Project Structure

```
.
├── apps/
│   ├── backend/                      # Fastify server
│   │   ├── src/
│   │   │   ├── modules/              # Feature modules
│   │   │   │   ├── auth/             # OAuth2 + session management
│   │   │   │   ├── journal-entries/  # Journal entries (oRPC + tests)
│   │   │   │   ├── prompts/          # Prompt management
│   │   │   │   ├── logs/             # API request logs
│   │   │   │   ├── subscriptions/    # API subscriptions
│   │   │   │   ├── teams/            # Teams & members
│   │   │   │   └── users/            # User management
│   │   │   ├── routers/              # Route organization
│   │   │   │   └── user_app/         # User-facing routes
│   │   │   ├── request_handlers/     # Request handling
│   │   │   ├── procedures/           # oRPC procedures
│   │   │   ├── db/                   # Database layer
│   │   │   ├── test/                 # Test utilities
│   │   │   ├── middlewares/          # Middleware
│   │   │   ├── configs/              # Configuration
│   │   │   └── server.ts             # Entry point
│   │   ├── vitest.config.ts          # Vitest configuration
│   │   └── package.json
│   └── frontend/                     # React + Vite
│       ├── src/
│       │   ├── modules/              # Feature modules
│       │   ├── components/           # Shared components
│       │   ├── pages/                # Page components
│       │   ├── utils/                # Utilities (oRPC client, auth)
│       │   ├── App.tsx
│       │   └── router.tsx
│       ├── e2e/                      # Playwright tests
│       ├── playwright.config.ts      # Playwright configuration
│       └── package.json
├── packages/
│   ├── typescript-config/            # Shared TypeScript configs
│   ├── ui-mui/                       # Material-UI component library
│   └── zod-schemas/                  # Shared Zod schemas for validation
├── turbo.json
└── package.json
```

## Project Overview

**Scheduled Prompt & Journal App** - Delivers timed notifications with thought-provoking prompts and enables text-based journaling with search, gamification (streaks & badges), free/paid tiers, and mobile & web support (PWA + Capacitor).

**Documentation**:
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - Roadmap and priorities
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines, code style, development setup
- [AGENTS.md](./AGENTS.md) - Agent guidelines for coding assistants

## Getting Started

### Prerequisites

- Node.js 22+
- Yarn 1.22.22
- PostgreSQL database

### Installation

1. Clone the repository:
```bash
git clone git@github.com:shipmyapp/connected-repo.git
cd connected-repo-starter-oRPC
```

2. Set up environment variables:
```bash
# Copy environment examples
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

3. Configure your database connection in `apps/backend/.env`

4. Install dependencies & build packages:
```bash
yarn install
yarn build
```

5. Create PostgreSQL databases (main & test), run migrations & seed:
```bash
yarn db create
yarn db up
yarn db seed
yarn test:db:setup  # Setup test database
```

### Development

Start both frontend and backend in development mode:
```bash
yarn dev
```

Or run them individually:
```bash
# Backend only (http://localhost:3000)
cd apps/backend && yarn dev

# Frontend only (http://localhost:5173)
cd apps/frontend && yarn dev
```

## Available Scripts

### Development
- `yarn dev` - Start all apps in watch mode
- `yarn build` - Build all apps and packages
- `yarn lint` - Run Biome linter across all workspaces
- `yarn format` - Format code with Biome
- `yarn check-types` - Type check all workspaces
- `yarn clean` - Remove node_modules and build artifacts

### Testing

**Backend Testing (Vitest):**
```bash
yarn test              # Run unit tests
yarn test:ui           # UI mode
yarn test:coverage     # Coverage report
yarn test:db:setup     # Setup test database
```

**Frontend E2E testing(Playwright):**
```bash
yarn test:e2e          # Run E2E tests
yarn test:e2e -b       # Build for testing
yarn test:e2e:ui       # UI mode
yarn test:e2e -b       # Build before testing (UI mode)
```

### Production

**Docker (frontend changes automatically excluded via `turbo prune`):**
```bash
# Local build (uses layer cache automatically)
docker build -f apps/backend/Dockerfile -t backend:latest .
docker-compose up

# CI/CD: Enable BuildKit cache in Coolify to skip rebuilds on frontend-only changes
# Without cache, every deployment rebuilds from scratch even if only frontend changed
docker buildx build --cache-from type=registry,ref=registry/backend:cache \
  --cache-to type=registry,ref=registry/backend:cache,mode=max \
  -f apps/backend/Dockerfile -t backend:latest .
```

**Standard Production:**
```bash
yarn build
yarn start
```

## Key Features

### Dual API Architecture

**oRPC for Internal APIs:**
- Type-safe APIs for frontend-backend communication
- Zero code generation - types flow automatically
- Routes: `/orpc/*`
- Example: `orpc.journalEntry.create.useMutation()`

**REST/OpenAPI for External APIs:**
- Automatic Swagger documentation at `/api/documentation`
- OpenAPI 3.1.0 spec generation from Zod schemas
- Routes: `/api/v1/*`
- Full middleware chain: API key auth, rate limiting, CORS validation, IP whitelist, subscription tracking

### API Gateway Features

**Authentication & Authorization:**
- API key-based authentication (`x-api-key` + `x-team-id` headers)
- Team-based access control with scrypt-hashed API keys
- User-specific subscriptions (teamId + userId + productSku)
- Bearer token authentication for webhooks

**Security:**
- Global rate limiting (2 req/sec, burst 5 req/10sec in production)
- Global CORS allows all origins; team-specific CORS validation via middleware
- Per-team rate limiting (configurable requests per minute)
- CORS validation against team's allowed domains with preflight handling
- IP whitelist per team
- OpenAPI security schemes (apiKey, teamId headers)
- Request logging to `api_product_request_logs` table
- 404 route protection with stricter rate limiting

**Subscription Management:**
- Quota enforcement per subscription
- Atomic real-time usage tracking
- 90% usage threshold triggers webhook alert
- Webhook queue with retry logic (3 max attempts)
- Batch processing limit: 100 webhooks per run via cron jobs

**Cron Jobs:**
- Bearer token authentication for secure cron job endpoints
- Automated webhook processing with batching and retry logic

### End-to-End Type Safety & Shared Schemas

The monorepo achieves full type safety without code generation:

1. Backend exports router type from `router.ts`
2. Frontend imports this type directly via TypeScript workspace references
3. Shared Zod schemas in `packages/zod-schemas/`:
   - Entity schemas: `<entity>CreateInputZod`, `<entity>UpdateInputZod`, `<entity>SelectAllZod`
   - API product schemas with OpenAPI metadata
   - Enum definitions for request status, webhook status, etc.
4. All API calls have autocomplete and compile-time type checking

```typescript
// oRPC usage (internal)
const { data } = orpc.journalEntry.getAll.useQuery();
const create = orpc.journalEntry.create.useMutation();

// OpenAPI usage (external)
// See interactive docs at /api/documentation
```

### Database & Testing

**Database Layer (Orchid ORM):**
- Automatic snake_case conversion, transaction support
- Zod schemas for validation across backend/frontend
- Timestamps: epoch milliseconds (number)
- Descriptive IDs (`userId`, `teamId`) and FKs (`authorUserId`)
- Tables organized by feature module in `modules/<feature>/tables/`
- Test database setup via `yarn test:db:setup`

**Testing Infrastructure:**
- Backend: Vitest with test database isolation
- Frontend: Playwright E2E with shared state across browsers
- Test utilities for auth flows and common operations

Key tables: users, sessions, teams, team_members, journal_entries, prompts, subscriptions, webhook_call_queue, api_product_request_logs

### Error Handling

Multi-layer error handling system:
- **oRPC Layer**: Transforms errors into structured responses
- **Error Parser**: Converts database/validation errors to user-friendly messages
- **Fastify Handler**: Catches unhandled errors

### Security

**Global:**
- Rate limiting: 2 req/sec, burst 5 req/10sec (production)
- CORS allows all origins globally (team validation via middleware)
- Helmet security headers
- 404 route protection (stricter rate limiting)
- Environment-based configuration

**Authentication:**
- Better Auth integration with Google OAuth
- Session management with secure cookies
- Device security and session tracking

**API Gateway:**
- API key authentication (scrypt hashed) via x-api-key + x-team-id headers
- Team-based access control
- Per-team rate limiting (configurable per minute)
- Per-team CORS validation against allowedDomains with preflight handling
- Per-team IP whitelist validation
- OpenAPI security schemes defined
- Internal routes secured by bearer token (INTERNAL_API_SECRET)
- Webhook endpoints secured by bearer token (team.subscriptionAlertWebhookBearerToken)

### Observability

- OpenTelemetry integration for tracing
- Custom spans for oRPC errors
- Sentry integration for error tracking and real user monitoring (RUM)
- Frontend error boundaries and React Router integration

## Adding New Features

### New Database Table

1. Create table in `apps/backend/src/modules/<feature>/tables/<entity>.table.ts`
   - Descriptive IDs: `userId`, `teamId`
   - Descriptive FKs: `authorUserId`
   - Use `timestampNumber` for timestamps
2. Create Zod schemas in `packages/zod-schemas/src/<entity>.zod.ts`
3. Register in `apps/backend/src/db/db.ts`
4. Generate migration: Always use command `yarn db g <name>` to generate migrations, never write migrations manually.
5. Run migrations: `yarn db up`
6. Add fixtures in `packages/zod-schemas/src/<entity>.fixture.ts` for testing

### New oRPC Endpoint (Internal API)

1. Import schema from `@connected-repo/zod-schemas/<entity>.zod`
2. Create procedure in `apps/backend/src/modules/<feature>/<feature>.router.ts`
3. Register in `apps/backend/src/routers/user_app/user_app.router.ts`
4. Use `rpcProtectedProcedure` for auth-required operations
5. Add tests in `apps/backend/src/modules/<feature>/<feature>.test.ts`
6. Frontend auto-gets types via oRPC router import

### New API Product Endpoint (External OpenAPI)

1. Define Zod schemas in `packages/zod-schemas/src/<entity>.zod.ts`
2. Add product to `API_PRODUCTS` in `packages/zod-schemas/src/enums.zod.ts`
3. Create handler in `apps/backend/src/modules/api-gateway/handlers/<product>.handler.ts`
4. Add route in `apps/backend/src/modules/api-gateway/api-gateway.router.ts`
5. Test via Swagger UI at `/api/documentation`

### New Cron Job Endpoint

1. Use `cronJobAuthProcedure` for Bearer token auth
2. Add to `routers/cron_jobs/cron_jobs.router.ts`
3. Handler processes batches with cursor-based pagination

### New Frontend Page

1. Create in `apps/frontend/src/modules/<feature>/pages/`
2. Add route in `apps/frontend/src/router.tsx` with lazy loading
3. Use oRPC hooks for data fetching
4. Add E2E tests in `apps/frontend/e2e/` or `src/modules/<feature>/<feature>.spec.ts`

## Turborepo

Uses Turborepo for task orchestration with dependency graph awareness. Key tasks: `build`, `dev`, `check-types`, `clean`.

Learn more: [Tasks](https://turbo.build/repo/docs/crafting-your-repository/running-tasks) | [Caching](https://turbo.build/repo/docs/crafting-your-repository/caching) | [Configuration](https://turbo.build/repo/docs/reference/configuration)

## Documentation

**Main**:
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - Development roadmap
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [AGENTS.md](./AGENTS.md) - Agent guidelines

**Component Guides**:
- [apps/backend/AGENTS.md](./apps/backend/AGENTS.md) - Backend patterns
- [apps/frontend/AGENTS.md](./apps/frontend/AGENTS.md) - Frontend React patterns
- [packages/AGENTS.md](./packages/AGENTS.md) - Package architecture
- [packages/ui-mui/AGENTS.md](./packages/ui-mui/AGENTS.md) - UI components
- [packages/zod-schemas/AGENTS.md](./packages/zod-schemas/AGENTS.md) - Zod schemas

## API Documentation

**Interactive API Documentation:**
- Swagger UI: http://localhost:3000/api/documentation
- OpenAPI Spec: http://localhost:3000/api/documentation/json

**Endpoints:**
- oRPC APIs: http://localhost:3000/orpc
- REST APIs: http://localhost:3000/api/v1/*
- Cron Jobs: http://localhost:3000/cron/*
- Health Check: http://localhost:3000/api/health
- Better Auth: http://localhost:3000/api/auth/*

## License

[AGPL-3.0](./LICENSE) - Copyright (c) 2025 Hexatech Hub Solutions LLP, India
