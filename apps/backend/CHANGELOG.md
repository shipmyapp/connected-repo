# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `assertNotLastOwner(teamId, memberId)`: the last-Owner rule as one function.
- `teams_api.writes_as_team_member_id`: the team member an API key's journal entries are written as.
- Redis 7 as a required service (`REDIS_URL`): `configs/redis.config.ts` (`getRedis`, `closeRedis`), `utils/redis.utils.ts` (`getRedisStatus`, `redisReady`); `ioredis` ^5.11.1. Compose (`redis` service in `docker-compose.dev.yml` and `docker-compose.yml`) and CI run one.
- `/health` reports `redis: "ok" | "down"`.
- `createRateLimitMiddleware` takes an async `bucketFn` and a `failClosed` option.
- `DB_SSL` (`disable` | `require` | `verify-full`) and `DB_SSL_CA` for a managed Postgres, used by the app pool, migrations and pg-tbus.
- `parseEnv` (exported from `configs/env.config.ts`) with tests.
- Startup line `Sentry: on (…)` / `Sentry: off (…)` on every boot.

### Changed

- `teams.addTeamMember` always creates a pending invitation (no immediate join, no account lookup) and accepts only the roles Admin and Member; 30 invitations per inviter per hour.
- Team refusals (`removeTeamMember`, `updateMemberRole`, `deleteTeam`) are typed 400/403/404/409 instead of 500.
- `journalEntries.getAll` / `getByUser` embed the author as `{ id, name, image }`.
- The OpenAPI journal `create-request` no longer takes `data.authorUserId`; it writes as the key's configured team member, into that team.
- `team_members`, `journal_entries` and `files` refuse a query without a team request context unless it lifts the scope.
- Rate limits are a token bucket in Redis (one Lua script, keys `rl:<bucket key>`), replacing the Postgres optimistic-lock bucket; limits, windows and 429 responses are unchanged. When Redis is down, limits let requests through.
- A blank env value now means unset for every variable (an empty `LOG_LEVEL` no longer stops the boot; empty Sentry sample rates no longer mean 0).
- The pg-tbus queue is named by `events/queue_names.ts` (`API_QUEUE = "connected-repo-backend"`), no longer by `OTEL_SERVICE_NAME`. Deployments that ran with another `OTEL_SERVICE_NAME` must set `API_QUEUE` to it or drain the queue before deploying.
- Postgres connections stay warm: idle connections live 5 minutes, up to 8 kept, TCP keep-alive. `yarn db seed` closes the pool when it is done.
- Table classes declare every index the migrations built; `files` gains `files_table_name_table_id_idx`. `openapi_pretty.json` regenerated; CI checks it (`check:openapi`).
- Validation errors name the first failing field in `message`; uncaught non-database errors carry their message outside production (production answers a fixed sentence, the trace id is in `x-trace-id`); unknown oRPC codes keep their 4xx status; 4xx are logged as warnings.
- The Better Auth handler no longer returns a thrown error's text in production.
- A failing cron is reported to Sentry.
- Sentry receives the user id only (no email, phone, name); URLs lose their query and fragment; health checks and the Sentry tunnel are never traced; profiling uses `profileSessionSampleRate` / `profileLifecycle`.
- Better Auth's burst limiter is off when `NODE_ENV=test`.
- Header-less requests read as `127.0.0.1` outside production and staging.

### Deprecated

- The `rate_limits` table and `RateLimitTable` are no longer used; a later release drops them.

### Removed

- The Better Auth phone-number plugin (phone-code sign-in and its routes).

### Fixed

- `me.profile` lists the caller's teams through an explicit membership query and returns reminder times as `HH:mm` (it failed its output validation).
- "Active team id mismatch" right after a team switch: the active-team gate re-reads the user row when Better Auth's cached cookie disagrees with `x-team-id`.
- Presigned PUTs no longer sign a CRC32 of an empty body, which made real uploads fail the checksum.
- dotenv no longer prints its banner on every start.
- Native Google sign-in: an id token from the iOS or Android app is verified against that app's client id (the old swap edited a property better-auth never reads). The dead web-Apple secret branch is removed.
- API product: `subscriptions.team_api_id`, `api_product_request_logs.team_api_id` and `pg_tbus_task_log.team_api_id` are `varchar(26)` like the `teams_api` ULID they name (as `uuid`, every write failed); `subscriptions.active` applies its `apiProductSku` filter; a SKU the key may not buy is a 403.

### Security

- Email + password sign-up and sign-in work only under `NODE_ENV=test`.
- Phone codes are no longer generated or written to the log.
- Pending invitations are claimed only by a verified email or phone; a Google/Apple sign-in to an address someone registered without proving it removes that registration's password and sessions.
- The super-admin allowlist requires a verified email or phone.
- An Admin can no longer add an Owner or remove an Admin; a team always keeps an Owner; the account a personal team belongs to cannot be removed or demoted.
- `files.create` can no longer rewrite or read another member's file; no create path accepts a file URL; stored non-http(s) URLs are cleared by a migration; a team logo must be on the app's storage.

## [1.1.0] - 2026-07-03

### Added

- Same-origin reverse proxy support: oRPC routes relocated under `/api/user-app`, with a new `user_app` request handler.
- User-created Novu workflow (`user_created.workflow.ts`) and deployment sync script (`scripts/deploy_novu_sync.sh`); Novu workflows now sync automatically on boot.
- `dayjs` dependency.

### Changed

- Improved RPC URL resolution.
- CSRF rejection logs now normalize header values to strings; CSRF and healthcheck error logging is more informative.
