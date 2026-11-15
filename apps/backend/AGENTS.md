# Backend Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: Robust, event-driven oRPC backend with strict schema enforcement and zero-downtime compatibility.
**Core Stack**: oRPC, Orchid ORM, pg-tbus, Better Auth, Novu, Redis (rate limits only).

**Key Architectures**:
- **Event-Driven**: `pg-tbus` for async tasks (notifications, usage tracking) and events.
- **Delta Sync**: Client-pull `pullBundles` procedures over the generic two-cursor `syncDeltaService`. There is NO SSE and no ORM-hook push channel.
- **Backward Compatibility**: N-1 frontend support; additive-only migrations; two-step deletions.
- **Dual Team Model**: `teams_app` (Session/UI) vs `teams_api` (Key/External).
- **Redis**: `configs/redis.config.ts` (`getRedis()`, one ioredis connection opened on first use, `closeRedis()` on shutdown) and `utils/redis.utils.ts` (`getRedisStatus`, `redisReady`). Holds only the rate-limit buckets (`modules/system/services/rate_limit.service.ts`); limits fail open when it is down. Tests use Redis database 1; tests that need a live Redis skip locally and fail in CI when it is missing.

---

## 2. Active Task
**Context**: Robust Boilerplate Standardization (Plan 005).
**Current Status**: Completed restoring advanced patterns (Push notifications, Cron scheduling, Security hardening).
**Intent**: Ready for next phase of MVP development (User Schedules).

---

## 3. Decision Records
| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-B01] | Additive Migrations | Accepted | Never rename/drop in one deployment to avoid downtime. |
| [ADR-B02] | Mutex Cron | Accepted | Prevent concurrent cron runs via a Postgres advisory lock (`pg_try_advisory_xact_lock`), safe across replicas. |
| [ADR-B03] | Soft Delete | Accepted | Mandatory for sync compatibility (use `deletedAt` field). |
| [ADR-B04] | Files Sync Rationale | Accepted | Use .merge() on create to backup asynchronous metadata. |
| [ADR-B05] | Backend Hardening | Accepted | Strict SSRF guards on webhooks, dummy hashes for API keys, and server-owned teamId scoping. |
| [ADR-B06] | Redis down = limits open | Accepted | `checkAndRecordRateLimit` lets a request through when Redis errors or times out (500 ms), logging once a minute; `{ failClosed: true }` (service) / `failClosed: true` (middleware) refuses instead. All four template limits (`app`, `sensitive`, `super-admin`, `openapi`) are fail-open. |

## Technical Guidelines

### Module Structure
```
src/
├── modules/<module>/
│   ├── tables/
│   ├── routers/
│   └── events/
├── procedures/ (public, protected, sensitive, open_api)
├── db/ (db.ts, base_table.ts)
└── events/ (tbus setup)
```

### Database & Migrations
- **Auto-Gen**: `yarn db g <name>` is MANDATORY.
- **Descriptive IDs**: `userId`, `teamId` (PascalCase class, snake_case columns).
- **Sync**: Expose a `pullBundles` procedure per synced table backed by `syncDeltaService`; clients pull deltas (no ORM-hook push).

### oRPC Endpoints
```typescript
export const create = rpcProtectedProcedure
  .input(schema)
  .handler(async ({ input, context }) => {
    return db.table.create({ ...input, authorUserId: context.user.id });
  });
```

### Event Bus (pg-tbus)
- **Emit**: `tbus.emit(eventDef, payload)`.
- **Tasks**: `tbus.registerTask(taskDef, handler)` with exponential backoff.

### Security
- **Auth**: Better Auth for sessions; `api-key-auth` for external.
- **Procedures**: Use `rpcSensitiveProcedure` for data-destructive actions.

### Testing
- **Vitest**: Test all CRUD operations. Use `createTestUserAndSession` for auth context.

## Quick Reference
- **DB**: `yarn db g <name>`, `yarn db up`, `yarn db seed`
- **OpenAPI**: `yarn gen:openapi`
