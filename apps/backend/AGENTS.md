# Backend Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: Robust, event-driven oRPC backend with strict schema enforcement and zero-downtime compatibility.
**Core Stack**: oRPC, Orchid ORM, pg-tbus, Better Auth, Novu, Redis (rate limits only).

**Key Architectures**:
- **Event-Driven**: `pg-tbus` for async tasks (notifications, usage tracking) and events.
- **Delta Sync**: Client-pull `pullBundles` procedures over the generic two-cursor `syncDeltaService`. There is NO SSE and no ORM-hook push channel.
- **Backward Compatibility**: N-1 frontend support; additive-only migrations; two-step deletions.
- **Dual Team Model**: `teams_app` (Session/UI) vs `teams_api` (Key/External).
- **Active team gate**: `rpcProtectedActiveTeamProcedure` wants `x-team-id` to name the user's active team. `context.user` is Better Auth's cookie copy of the row (five minutes old at most); when the header and the copy disagree the gate reads `users.activeTeamAppId` once and the row decides (`teams.setActiveTeam` writes it behind Better Auth's back).
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
| [ADR-B01] | Additive migrations (expand/contract) | Accepted | Never rename or drop in one deployment. Release N expands: add the new column/table, write both, stop reading the old one (old and new code, and N-1 clients, run against the same schema). Release N+1 contracts: drop the old column/table once nothing running reads it. A synced table's dropped column also leaves its zod select schema in N+1, not N. |
| [ADR-B02] | Mutex Cron | Accepted | Prevent concurrent cron runs via a Postgres advisory lock (`pg_try_advisory_xact_lock`), safe across replicas. |
| [ADR-B03] | Soft Delete | Accepted | Mandatory for sync compatibility (use `deletedAt` field). |
| [ADR-B04] | Files Sync Rationale | Accepted | Use .merge() on create to backup asynchronous metadata. |
| [ADR-B05] | Backend Hardening | Accepted | Strict SSRF guards on webhooks, dummy hashes for API keys, and server-owned teamId scoping. |
| [ADR-B06] | Redis down = limits open | Accepted | `checkAndRecordRateLimit` lets a request through when Redis errors or times out (500 ms), logging once a minute; `{ failClosed: true }` (service) / `failClosed: true` (middleware) refuses instead. All four template limits (`app`, `sensitive`, `super-admin`, `openapi`) are fail-open. |
| [ADR-B07] | Indexes declared on the table classes | Accepted | Every index, including partial unique ones, is declared on its table class so `yarn db g` reproduces it. The generator leaves enum columns out of its partial-index comparison: check a new partial index on an enum column by hand. |
| [ADR-B08] | Explicit ids on stamped tables | Accepted | orchid-orm 1.73 misbinds INSERT parameters when a `default(() => ulid())` column meets `setOnCreate` columns (a ULID lands in the stamped column). `idAndAuditTimestamps` declares `id` without a runtime default; a table with `setOnCreate` columns passes `id: ulid()` from the service, never `ulidWithDefault()`. |
| [ADR-B09] | Refusals keep their 4xx | Accepted | `handleBoundaryError` keeps an oRPC error's own 4xx status for codes it does not map (a CSRF refusal is a 403, not a 500), logs 4xx as `warn` "request refused" and 5xx as `error`; validation errors name the first failing field in `message`. An uncaught non-Postgres error carries its message outside production only; production answers "An unexpected error occurred" and the caller quotes the `x-trace-id` header; a Postgres error's text never leaves. A refusal in a handler is an `ORPCError` with a 4xx, never a plain `Error`. |
| [ADR-B10] | Auth providers are swapped per request, never edited | Accepted | better-auth builds each social provider around its options and never reads properties set on the provider object later; the provider list is shared by every request. `hooks.before` may replace an entry in `ctx.context.socialProviders` (this request's copy) with a freshly built provider (`apple_ios`, native Google via `native_google.lib.ts`); it never mutates one. |
| [ADR-B11] | No schema drift | Accepted | Every index the migrations create is declared on its table class with the same name, columns, order and `where`, so `yarn db g check_no_drift` writes nothing; run it before `yarn db g <name>`. `openapi_pretty.json` is regenerated with every user-app router change (`check:openapi` in CI). |
| [ADR-B12] | Crons report their failures | Accepted | Every cron's outer `catch` logs and calls `captureBackendException(error, { captureAll: true, tags: { handler: "cron.<name>" } })`. |
| [ADR-B13] | API keys write as a team member | Accepted | `teams_api.writes_as_team_member_id` names the membership the journal create-request writes as; the write runs inside that team's request context. Null refuses the write (403). Set it when issuing a key: `UPDATE teams_api SET writes_as_team_member_id = '<team_members.id>' WHERE team_api_id = '<key id>';`. |
| [ADR-B14] | Teammates see public user fields only | Accepted | A relation that shows one member to another selects `userPublicZod` (`id`, `name`, `image`), never `userSelectAllZod`. |

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
- `createUserAndLogin()` returns a verified account (as Google/Apple sign-ins are); pass `{ verified: false }` for an unproved address. `src/test/utils/team.utils.ts` builds shared teams and members (`createSharedTeam`, `addMember`, `onTeam`).

## Quick Reference
- **DB**: `yarn db g <name>`, `yarn db up`, `yarn db seed`
- **OpenAPI**: `yarn gen:openapi`
