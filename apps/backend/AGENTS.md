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
- **Redis**: `configs/redis.config.ts` (`getRedis()`, one ioredis connection opened on first use, `closeRedis()` on shutdown) and `utils/redis.utils.ts` (`getRedisStatus`, `redisReady`). Holds only the rate-limit buckets (`modules/system/services/rate_limit.service.ts`) and the ended-session marks (`modules/auth/services/revoked_sessions.auth.service.ts`); both fail open when it is down. Tests use Redis database 1; tests that need a live Redis skip locally and fail in CI when it is missing.

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
| [ADR-B15] | Super-admin over RPC and OpenAPI | Accepted | `superAdminRouter` is served twice: RPC at `/api/super-admin` for the console's typed client, OpenAPI + Scalar at `/super-admin/` for people and scripts. Admin reads are cross-tenant on purpose (`team_members` through `.unscope("default")`); lists count the filter and order only the page (`count()` on an ordered query fails in Postgres). Every mutation is wrapped in `withOperatorAudit` (root ADR-033). |
| [ADR-B16] | modules/devices | Accepted | `device_cookie.devices.middleware.ts` (`applyDeviceCookie` in `main.handler.ts` before the auth handler; `deviceKeyOf(headers)`), `report.devices.service.ts` (one upsert; moves an address between accounts; Novu full-list sync in the same transaction), `push.devices.service.ts` (`syncNovuFcmCredentials`, `pushOffDevice`), `install_tries.devices.service.ts`, `device_state.devices.service.ts` (`devices.here`). The nightly reconcile and the silent-sync cron read `devices`. |

## What to declare in a privacy notice

Your devices: for each phone, tablet or computer you use, its kind, model, browser, operating system and version, screen size, time zone and language; whether the app is installed there and when it was last opened installed; whether notifications are allowed there; its push token; the app's install offers there and what came of them; a random device label kept in the `app_device` cookie (up to 400 days, renewed while used, never used to sign in). Why: to offer the app and ask for notifications only where they are missing, to send notifications to the devices you turned them on for, and to recognise an iPhone's Safari and its Home Screen app as one phone (matched from these few facts, never from your position or anything you type). Kept while your account exists.

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
- **Enum values**: a value added to a Postgres enum (`ALTER TYPE … ADD VALUE`) can be used only after its transaction commits: add it in its own migration and use it in the next.
- **Irreversible migrations**: a migration that cannot be undone says so in its comment and makes `down` a no-op (or the inverse of the constraint only).
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
- Notifications: from a request, `queueNotification()` (`modules/notifications/services/dispatch.notifications.service.ts`), which never throws; from a task handler, `triggerNotification()` (`utils/notifications.utils.ts`), which throws so pg-tbus retries. Workflows live in `src/novu/workflows` (see the root rule "Novu workflows and templates" before changing one). An address with no account is the subscriber `emailSubscriberId(email)`.
- Novu setup per environment: Secret Key → `NOVU_SECRET_KEY`, `NOVU_API_URL`; Application Identifier → frontend `VITE_NOVU_*`; in Novu: a primary email integration, the FCM integration (service-account JSON), In-App HMAC on. The first boot with a key creates the workflows.

### Security
- **Auth**: Better Auth for sessions; `api-key-auth` for external.
- **Procedures**: Use `rpcSensitiveProcedure` for data-destructive actions.
- **Client address**: never read `x-forwarded-for` or `x-real-ip`: use `getClientIpAddress(reqHeaders)` (the address `main.handler.ts` stamps into `x-client-ip` from `TRUSTED_PROXY_COUNT`).
- **Auth secret**: rotating `BETTER_AUTH_SECRET` signs everyone out and makes stored provider tokens unreadable (they are rewritten at the next sign-in).
- **Webhooks**: calls use `webhookHttpsAgent` and `proxy: false`; receivers verify `X-Webhook-Signature` (`t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`).
- **Logs**: fields named in `LOG_REDACT_PATHS` (`utils/logger.utils.ts`) are censored; add a key there (and a case to `logger.utils.test.ts`) before logging a new kind of secret.
- **Operations**: after deploying encrypted provider tokens, run `yarn workspace @connected-repo/backend auth:encrypt-tokens` once per environment.

### Account lifecycle (root ADR-046 to ADR-049)
- `modules/users/account.user_app.router.ts`; services `deletion`, `purge`, `export`, `sessions` (`*.users.service.ts`). Operator actions on a deletion are console procedures (`cancelAccountDeletion`, `purgeAccountNow`) through `withOperatorAudit`. Only the purge deletes a `users` row (Better Auth's `deleteUser` stays off). Any new table with a `user_id` gets a line in `purgeAccount` (or a CASCADE FK), a column list in `exportAccountData`, and an entry in `PERSON_COLUMNS` of `purge.users.test.ts` (the test fails on an unlisted foreign key to `users`); never `selectAll()` in the export.
- `rpcSessionProcedure`: session only, any account state. Only for `account.cancelDeletion`. Everything else is `rpcProtectedProcedure` or narrower (it refuses an account scheduled for deletion with `403 ACCOUNT_DELETION_PENDING`).
- `rpcSensitiveProcedure` needs a session row younger than `RECENT_SIGN_IN_MINUTES` (`403 REAUTH_REQUIRED`).
- A session deleted with Orchid is also passed to `markSessionRevoked` (no Better Auth hook runs).
- Bucket objects are deleted only through `queueObjectDeletions` (inside the transaction that deletes their rows) and `drainObjectDeletions` (after commit).

### Application MCP (`modules/user_mcp`, ADR-045)
- A tool never writes with `db` directly; it calls a procedure through `ctx.app(teamId)` (add the procedure to `connectedAppRouter` in `services/app_client.user_mcp.service.ts` first). Writes use the preview + confirmation pattern of `create_journal_entry`. `RpcContext.connectedApp` is set only by `appClientFor`; never derive it from a request.
- A team-scoped tool resolves its team with `teamForCall(ctx.principal, args.teamId)` (membership checked; `users.activeTeamAppId` is never written). Direct reads of tenant-scoped tables from a tool use `.unscope("default")` with an explicit team or user condition.
- Every path that creates an OAuth client checks redirect URIs with `isAcceptableRedirectUri` (`@connected-repo/zod-schemas/redirect_uri.utils`); never route `/api/auth/oauth2/register` to Better Auth. Budgets for anything an unauthenticated caller can trigger are per IP (`getClientIpAddress`) and in total, never per `client_id` only.
- `userMcpAudiences()` is both the provider's `validAudiences` and what `principalFromBearer` accepts: a second resource server goes into that list or is refused.

### Team hosts (`<slug>.<root>`)
- `request_handlers/tenant.handler.ts`: `GET /api/tenant/manifest.webmanifest` (slug from `Host`/`X-Forwarded-Host`, else `?slug=`; `Cache-Control: no-cache`). `modules/teams/services/branding.teams.service.ts`: the public projection, the manifest, the slug lookups and the origin checks.
- The active-team gate (`rpcProtectedActiveTeamProcedure`) has two extra branches: it re-reads the users row when the cookie's copy disagrees with `x-team-id`, and it accepts the team whose own host sent the request (`Origin`, else `X-Forwarded-Host`/`Host`). Membership is checked after both.
- `TENANT_ROOT_DOMAIN` turns team hosts on; `AUTH_COOKIE_PREFIX` only for two stacks under one cookie domain.
- Origins: `teamHostSlugFromOrigin` (shape) + `isAllowedCredentialedOrigin` (live team) decide credentialed CORS; `teamOriginsForAuthRequest` feeds better-auth's `trustedOrigins`. Never add a `*.<root>` pattern. The super-admin handlers keep the exact `ALLOWED_ORIGINS` list, and both check `x-csrf-token` in production and staging (Scalar's "try it" needs `x-csrf-token: orpc` for writes there).
- Emails and pushes about a team name and link the app through `teamAppIdentity` (`branding.teams.service.ts`): the team's host and app name when it has a slug, else `WEBAPP_URL` and the template's name.
- `teams.addTeamMember` always creates a **pending** invitation (`userId` and `joinedAt` null) and, for an email, queues the same `team-invitation` email whatever the address is (at most 5 a day per address). Nothing on this path looks the person up; who may be added is checked when the invitation is created or claimed, never by reading the invitee here.
- Nothing but the app under `TENANT_ROOT_DOMAIN`: `S3_PUBLIC_URL` under it fails the env check; `updateTeam` accepts pictures only from the app's own storage; `assignTeamSlug` is the only writer of `teams_app.slug` and writes an operator audit row.

### Testing
- **Vitest**: Test all CRUD operations. Use `createTestUserAndSession` for auth context.
- `createUserAndLogin()` returns a verified account (as Google/Apple sign-ins are); pass `{ verified: false }` for an unproved address. `src/test/utils/team.utils.ts` builds shared teams and members (`createSharedTeam`, `addMember`, `onTeam`).

## Quick Reference
- **DB**: `yarn db g <name>`, `yarn db up`, `yarn db seed`
- **OpenAPI**: `yarn gen:openapi`
