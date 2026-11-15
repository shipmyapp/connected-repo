# Monorepo Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: Production-ready full-stack TS monorepo with E2E type safety and offline-first delta sync.
**Core Stack**: 
- **Repo**: Turborepo + Yarn
- **Backend**: oRPC + Orchid ORM + PostgreSQL + Redis (rate limits) + pg-tbus + Better Auth
- **Frontend**: React 19 + Vite + TanStack Query + Dexie.js (IndexedDB) + pull-delta sync (no SSE)
- **Packages**: Shared Zod schemas, UI components (MUI)
- **Tooling**: Biome (Tabs, 100 chars, double quotes), knip

**Architecture Patterns**:
- **Bimodal Docs**: `README.md` (Human) vs `AGENTS.md` (Agent)
- **Worker Isolation**: `DataWorker` (DB/Sync) vs `MediaWorker` (Stateless/Uploads)
- **Sync Integrity**: Offline mutations allowed ONLY for unsynced records.
- **Strict TS**: NO `any`, NO `as unknown`, NO `ts-ignore`.

---

## Layer 2: Active Task
- **Objective**: Frontend and shared packages: generic fixes.
- **Status**: Completed.
- **Context**: A team switch sticks and survives an offline restart (one uncached session read after the switch, the offline auth cache patched, ADR-029); the theme is chosen on the profile page and saved to the account; `packages/ui-mui` holds the shared confirm dialog, relative time, error screens, toast container, drawer transition and `utils/*` (ADR-030); blank `VITE_*` keys are unset (ADR-031); Sentry sends without a boot probe or PII; the avatar is a plain link to the profile page, which holds Teams, Appearance and Sign out; Back closes an open dialog; component tests run in jsdom.

## Layer 3: Decision Records

| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-001] | Pivot to OneQ | Accepted | App returns to its ultra-minimalist journaling roots. |
| [ADR-002] | Snake Case Columns in Raw SQL | Accepted | Always use snake_case in raw SQL Orchid ORM migrations. |
| [ADR-003] | Hybrid Auth (Cookies + Bearer) | Accepted | Support both web and mobile auth via Better Auth bearer plugin. |
| [ADR-004] | Smart CSRF Exception | Accepted | Exclude Bearer-token requests from CSRF checks for mobile compatibility. |
| [ADR-005] | OPFS Storage Persistence | Accepted | Move binary blobs from IndexedDB to OPFS to prevent browser eviction and improve performance. |
| [ADR-006] | Direct Imports | Accepted | NO barrel exports to ensure optimal tree-shaking. |
| [ADR-007] | Files Metadata Idempotency | Accepted | Use .merge() for files creation to capture asynchronous metadata enrichment. |
| [ADR-008] | Sync Recovery (Lost Files) | Accepted | Flag `isMainFileLost` allows metadata sync even if binary data is purged from storage. |
| [ADR-009] | Virtual Media Provider | Accepted | Serve OPFS media via Service Worker fetch interception to avoid avoid `URL.createObjectURL` overhead. |
| [ADR-010] | Token Bucket Rate Limiting | Superseded by ADR-016 | Was an optimistic-locking token bucket in Postgres (`rate_limits`); the bucket now lives in Redis. |
| [ADR-011] | Pull Bundles Renaming | Accepted | Rename sync table procedures from `pullDelta` to `pullBundles`. |
| [ADR-012] | Backend Security Hardening | Accepted | Implementing strict SSRF guards, dummy hashes for timing attacks, and strict teamId scoping for multitenant safety. |
| [ADR-013] | Novu Push Notifications | Accepted | Implemented FCM token synchronization and notification dispatch using Novu with optimistic DB-first tracking. |
| [ADR-014] | Silent Sync Trigger | Accepted | Implemented FCM silent pushes to wake up the app for background sync, bypassing OS notifications. |
| [ADR-015] | No dead code, as we go | Accepted | Biome (unused imports and variables are errors; the backend's nested config extends the root) runs on staged files in a pre-commit hook; knip (unused files, exports, types, dependencies) and the typecheck run pre-push; CI runs knip and a blocking lint. Hooks live in `.githooks/`, installed by the root `prepare` script. `knip.jsonc` lists the offline-first entries (service worker, data and media workers). Kept features that knip cannot see are taught to it, never deleted. |
| [ADR-016] | Redis required; rate limits in Redis | Accepted | Redis 7 is a required service next to Postgres (`REDIS_URL`), never the source of truth and with no worker, pub/sub or realtime on it. Every rate limit is a token bucket run by one Lua script (`rl:<scope>:<subject>:<id>`, refills at limit/window, expires when full). When Redis fails, limits fail open; `failClosed` is only for a limit that is the sole guard on a guessable secret (none today). `/health` reports `redis: ok/down` with HTTP 200. The `rate_limits` table is unused and dropped in a later release (expand/contract). |
| [ADR-017] | A blank env value is unset | Accepted | `parseEnv` (apps/backend/src/configs/env.config.ts) drops "" before the zod schema, so `KEY=` in a .env or an empty Dokploy field takes the variable's default instead of failing `z.url()`/`z.enum()` or coercing to 0; a required variable left blank is still refused. |
| [ADR-018] | pg-tbus queue named in code | Accepted | `events/queue_names.ts` `API_QUEUE` names the pg-tbus service; `OTEL_SERVICE_NAME` only names traces and logs. Renaming the queue strands queued tasks: change it only with a drained queue. |
| [ADR-019] | Stale session cookie never refuses the active team | Accepted | Better Auth's 5-minute cookie cache holds a copy of the user row, and `teams.setActiveTeam` writes the row outside Better Auth. `rpcProtectedActiveTeamProcedure` re-reads `users.activeTeamAppId` once when `x-team-id` and the copy disagree; the frontend re-signs the cookie (`getSession({ query: { disableCookieCache: true } })`) after a switch. Not `disableCookieCache` on every request (one read per RPC). |
| [ADR-020] | Sign-in doors match the providers | Accepted | Sign-in is Google, Apple and the bearer plugin. Better Auth's email + password is enabled only under NODE_ENV=test (backend tests, e2e). No phone-code plugin; users.phone_number stays as data. Invitations are claimed, and the super-admin allowlist matches, only through a verified email or phone. A Google/Apple link to an unverified user first deletes that user's password account and sessions. |
| [ADR-021] | Team roles enforced on the server | Accepted | An invitation makes an Admin or a Member; only an Owner makes, unmakes or removes an Owner or an Admin; a team keeps at least one Owner with an account; the account a personal team belongs to stays its Owner and is never removed; refusals are typed 4xx. The rule lives in `assertNotLastOwner(teamId, memberId)` (modules/teams/services/team_roles.teams.service.ts); every path that ends or demotes an Owner membership calls it. addTeamMember always writes a pending invitation (30 per inviter per hour). |
| [ADR-022] | Tenant scopes fail closed | Accepted | team_members, journal_entries and files throw when queried without a team request context; a cross-team query says `.unscope("default")` and names its team or user in the where. Inserts are not scoped. |
| [ADR-023] | File URLs only through pushCdnUpdates | Accepted | No create path accepts cdnUrl/thumbnailCdnUrl (the input schema allows only null); files.create inserts or refuses (409), never upserts; utils/cdn_url.utils.ts holds the storage-URL rule for file and picture URLs; the client opens stored URLs only when http(s), with noopener. |
| [ADR-024] | Client IP from a counted proxy chain | Accepted | main.handler.ts stamps `x-client-ip` once per request: the X-Forwarded-For entry TRUSTED_PROXY_COUNT places from the right (0 = the socket address); a client-sent x-client-ip is dropped. Everything (getClientIpAddress, the API-key IP allowlist, per-IP limits, Better Auth's ipAddressHeaders) reads that value; X-Real-IP and the left-most X-Forwarded-For entry are never trusted. Deployed and dev-compose stacks: TRUSTED_PROXY_COUNT=1 (the app's nginx overwrites X-Forwarded-For with $remote_addr). |
| [ADR-025] | Limits before expensive work | Accepted | app:user is charged once on rpcProtectedProcedure; OpenAPI calls pay a per-IP bucket before the scrypt key check; public procedures are per-IP limited; createTeam 10/hour. Body limits: 64 KiB auth, 10 MiB app RPC/mobile, 1 MiB elsewhere; the DataWorker pushes creates 20 at a time. |
| [ADR-026] | Ended sessions refused at once | Accepted | databaseHooks.session.delete.after writes revoked-session:<id> to Redis for the cookie cache's life; rpcAuthMiddleware refuses it (one EXISTS per call; Redis down = the 5-minute cookie bound). The session-security middleware logs an address change and never refuses on it. |
| [ADR-027] | Objects under the uploader's folder | Accepted | The presigner derives `<team>/<uploader>/<resource>/<id>_<name>` and refuses active types (SVG, HTML, XML, JS) and non-canonical type strings; pushCdnUpdates accepts only a URL naming the row's own object. The bucket stays public-read by URL (offline media path); its public host must not be under the app's cookie domain. |
| [ADR-028] | Secrets at rest and at boot | Accepted | Provider tokens encrypted (account.encryptOAuthTokens; `auth:encrypt-tokens` once for older rows); bearer requires a signed token; CSRF is skipped only for bearer requests without cookies; a production/staging boot refuses the example BETTER_AUTH_SECRET; Better Auth telemetry off. |
| [ADR-029] | Fresh session after a team switch | Accepted | `teams.setActiveTeam` writes `users.activeTeamAppId` outside better-auth, whose 5-minute `session.cookieCache` keeps the old team. The switch patches the cached user (`patchAuthCacheUser`), calls `requestFreshSession()` and awaits the router revalidation inside the closed switch gate; `authLoader`'s online path consumes the flag for one `disableCookieCache` read. The backend gate's row re-read (`rpcProtectedActiveTeamProcedure`) stays. |
| [ADR-030] | One copy of shared web pieces | Accepted | Components and browser helpers used by more than one Vite app live in `packages/ui-mui` (`components/ConfirmDialog`, `components/When`, `feedback/AppErrorBoundary`, `feedback/ErrorScreen`, `feedback/AppToastContainer`, `feedback/DrawerTransition`, `utils/*`); env primitives in `packages/zod-schemas/src/env_utils.ts`. An app never copies one. |
| [ADR-031] | Blank env means unset | Accepted | Every optional `VITE_*` key goes through `blankAsUndefined` (`@connected-repo/zod-schemas/env_utils`): an empty Docker build arg must build, not fail validation. |

## Quick Reference
- **Dev**: `yarn dev`
- **Build**: `yarn build`
- **Check**: `yarn lint`, `yarn format`, `yarn check-types`, `yarn knip`
- **Hooks** (no dead code, as we go): `yarn install` points git at `.githooks/`. **pre-commit** runs Biome on the staged files (unused imports and variables are errors); **pre-push** runs `yarn knip` (unused files, exports, types, dependencies) and `yarn check-types`; CI runs both and lint. They are clean on `main`, so a red one is yours: remove what the change left unused (an old path a new one replaced, a helper nobody calls, a dependency) rather than exporting it again or skipping the hook. Code of a kept feature that knip cannot see is taught to `knip.jsonc` with a comment, never deleted.
- **DB**: `yarn db g <name>`, `yarn db up`, `yarn db seed`

## Module Deep Dives
- [apps/backend/AGENTS.md](apps/backend/AGENTS.md)
- [apps/frontend/AGENTS.md](apps/frontend/AGENTS.md)
- [packages/AGENTS.md](packages/AGENTS.md)
- [packages/ui-mui/AGENTS.md](packages/ui-mui/AGENTS.md)
- [packages/zod-schemas/AGENTS.md](packages/zod-schemas/AGENTS.md)
