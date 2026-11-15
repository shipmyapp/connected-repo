# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `account.*` on the user-app router: `deletionBlockers`, `requestDeletion`, `cancelDeletion`, `exportData`, `listSessions`, `revokeSession`, `revokeOtherSessions`, `acceptLegal`, and the public `localDataErasure` / `ackLocalDataErasure` (device cookie only).
- The daily `purge_deleted_accounts` cron (`purgeAccount`), the `storage_object_deletions` bucket queue (`DeleteObjects` in batches of 1 000) and `erased_device_keys` (migration `0016_account_lifecycle`).
- `teams.leaveTeam`; console procedures `cancelAccountDeletion` and `purgeAccountNow` (audited); `deletionRequestedAt` in `listUsers`.

- The application MCP at `/mcp` (`request_handlers/user_mcp.handler.ts`, `modules/user_mcp`): Better Auth's OAuth provider (`@better-auth/oauth-provider` 1.5.0), tables `oauth_clients`, `oauth_access_tokens`, `oauth_refresh_tokens`, `oauth_consents` and `connected_app_actions` (migration `0015_connected_apps`); seven tools over a curated client of the user app's procedures; discovery at `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server/api/auth`.
- Open client registration in front of Better Auth's (`oauth_registration.handler.ts`): app-chosen metadata only, PKCE forced, redirect URIs `https:` or loopback `http:` with a port; 10 a minute per IP, 500 a day in total, at most 5000 apps. Client ID Metadata Documents fetched through the SSRF guard (per document, per IP and in total). The daily `oauth_clients_cleanup` cron removes apps nobody connected after a week.
- `connectedApps.address`, `list`, `describe`, `setScopes`, `disconnect` on the user-app router.
- `MCP_PUBLIC_URL`: serve `/mcp` on its own host (the API host answers 404 for it).
- Log redaction for OAuth wire names (`access_token`, `refresh_token`, `client_secret`, `code_verifier`).

- Novu workflows and the email layout as code objects with `updatedAt` (`src/novu/workflows`, `src/novu/layouts`); `ensureNovuWorkflows` at boot creates missing ones and updates Novu only when the code is newer, so dashboard edits are kept.
- `yarn novu:status`, `yarn novu:pull`, `yarn novu:check` (first step of `yarn build`); skill `novu-pull`.
- `test-push` workflow (triggered by `notifications.testSendPush`, which until now had no workflow).
- `team-invitation` email when an Owner/Admin adds a member by email, on the generic `app` email layout; a team with its own host is linked there, under its own app name. At most 30 adds per inviter per hour and 5 invitation emails per address per day (Redis; the per-address limit fails closed).
- `queueNotification()` and the pg-tbus task `notification_dispatch`; `emailSubscriberId` in `notifications.utils.ts`.

- `devices` table, `sessions.device_key` and `users.asks` (migration `0014_devices`; live `push_devices` rows copied as `legacy-<id>`).
- The `app_device` cookie and the `x-device-id` header name the device; `devices.report`, `devices.recordInstallTry`, `devices.pushOff`, `devices.here`; `me.asks`, `me.recordAsk`.

- Super-admin router over oRPC at `/api/super-admin` (`super_admin_rpc.handler.ts`) for the console; `listTeams`, `getTeam`, `listUsers`, `revokeUserSessions`, `auditList`; `ping` returns the operator's name.
- `operator_audit_log` (migration `0012`) and `withOperatorAudit`: every super-admin change is recorded with the operator, before and after, reason and client IP, in the same transaction as the change.
- `TRUSTED_PROXY_COUNT`: trusted proxy hops counted from the right of X-Forwarded-For (0 = socket address).
- `auth:encrypt-tokens` script: encrypts provider tokens stored before encryption was on.
- Webhook bodies carry `X-Webhook-Signature` when a webhook secret is configured.

- `assertNotLastOwner(teamId, memberId)`: the last-Owner rule as one function.
- `teams_api.writes_as_team_member_id`: the team member an API key's journal entries are written as.
- Redis 7 as a required service (`REDIS_URL`): `configs/redis.config.ts` (`getRedis`, `closeRedis`), `utils/redis.utils.ts` (`getRedisStatus`, `redisReady`); `ioredis` ^5.11.1. Compose (`redis` service in `docker-compose.dev.yml` and `docker-compose.yml`) and CI run one.
- `/health` reports `redis: "ok" | "down"`.
- `createRateLimitMiddleware` takes an async `bucketFn` and a `failClosed` option.
- `DB_SSL` (`disable` | `require` | `verify-full`) and `DB_SSL_CA` for a managed Postgres, used by the app pool, migrations and pg-tbus.
- `parseEnv` (exported from `configs/env.config.ts`) with tests.
- Startup line `Sentry: on (…)` / `Sentry: off (…)` on every boot.
- Branding columns on `teams_app` (migration `0013_team_branding`).
- `teams.updateTeam`, public `teams.getBrandingBySlug`, super-admin `assignTeamSlug`.
- `GET /api/tenant/manifest.webmanifest`: a team's own manifest, with the shared app's install pictures (`screenshots`) and, without an uploaded icon, the maskable icon.
- `TENANT_ROOT_DOMAIN`, `AUTH_COOKIE_PREFIX`.
- Team-host origins are accepted by CORS and better-auth.
- The active-team gate accepts the team whose own host sent the request, without moving the user's active team.

### Changed

- `rpcProtectedProcedure` refuses an account scheduled for deletion (`403 ACCOUNT_DELETION_PENDING`); `rpcSessionProcedure` is the session-only layer. `rpcSensitiveProcedure` requires a session row under 10 minutes old (`403 REAUTH_REQUIRED`).
- `teams.deleteTeam` takes `{ teamId }`, works on any team the caller owns, soft-deletes every membership and moves members off it; `addTeamMember` refuses a personal team; an account scheduled for deletion claims no invitation.
- `teams_app.created_by_user_id` is nullable with `ON DELETE SET NULL`.
- A connected app acts for no account scheduled for deletion; reminders skip such accounts.

- `triggerNotification` drops empty strings and nulls from the payload so templates test optional fields with `{% if payload.x %}`; its error log no longer carries an invitee's address.
- `user-created`, `user-reminder` and `journal-entry-created` rewritten as Liquid templates; same wording.
- `teams.addTeamMember` refuses adding yourself (409).

- `notifications.registerDevice` / `revokeDevice`, the nightly FCM reconcile and the silent-sync cron work on `devices`.

- The client address is decided once per request from the counted proxy chain and stamped into `x-client-ip`.
- Every authenticated call is charged to the `app:user` limit once; `createTeam` is limited to 10 per hour; public and pre-auth OpenAPI calls are limited per address.
- Request bodies are limited (64 KiB auth, 10 MiB app RPC and mobile, 1 MiB elsewhere).
- Uploaded objects live under `<team>/<uploader>/`.
- The session-security middleware logs an address change instead of refusing it, and no longer has a fingerprint check.
- Better Auth telemetry is off.
- `/` and `/health` answer `status`, `timestamp` and `redis` outside development.

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
- Cross-subdomain cookies also apply when `NODE_ENV=staging`.

### Deprecated

- `push_devices` is no longer read or written; it is dropped in the next release.

- The `rate_limits` table and `RateLimitTable` are no longer used; a later release drops them.

### Removed

- `@novu/framework` (and `zod-to-json-schema`, which only it used), the `/api/novu` bridge (`novu.handler.ts`), `yarn novu:sync`, `scripts/deploy_novu_sync.sh` and the `npx novu@latest sync` spawned at every boot.

- The Better Auth phone-number plugin (phone-code sign-in and its routes).

### Fixed

- A journal entry deleted outside a team request took the tenant scope with it and threw; its attachments are now found by the entry ids alone.
- Graceful shutdown stops the silent-sync cron.

- The journal fan-out compared the ULID team id as a `uuid`, so the task failed on every run and no teammate was told about a new entry.

- A new session records the browser, OS and device its user agent describes (the columns existed and were never filled).

- `me.profile` lists the caller's teams through an explicit membership query and returns reminder times as `HH:mm` (it failed its output validation).
- "Active team id mismatch" right after a team switch: the active-team gate re-reads the user row when Better Auth's cached cookie disagrees with `x-team-id`.
- Presigned PUTs no longer sign a CRC32 of an empty body, which made real uploads fail the checksum.
- dotenv no longer prints its banner on every start.
- Native Google sign-in: an id token from the iOS or Android app is verified against that app's client id (the old swap edited a property better-auth never reads). The dead web-Apple secret branch is removed.
- API product: `subscriptions.team_api_id`, `api_product_request_logs.team_api_id` and `pg_tbus_task_log.team_api_id` are `varchar(26)` like the `teams_api` ULID they name (as `uuid`, every write failed); `subscriptions.active` applies its `apiProductSku` filter; a SKU the key may not buy is a 403.

### Security

- `teams.addTeamMember`'s invitation email is the same whether or not the address has an account and goes to the address's own subscriber, so neither the response, the member list nor the email reveals an account.
- Invitation emails are rate-limited per inviter and per address.

- `/super-admin/` (OpenAPI) requires `x-csrf-token: orpc` in production and staging, as `/api/super-admin` does.
- X-Forwarded-For and X-Real-IP no longer decide the client address (API-key IP allowlist, limits, session IP).
- Credentials, tokens, cookies and API keys are redacted from logs and Sentry breadcrumbs.
- SVG and other active content types are refused for upload; a member can no longer overwrite a teammate's object or point a file at another object.
- A production or staging boot refuses the example `BETTER_AUTH_SECRET`.
- Google/Apple tokens are encrypted at rest; the bearer plugin requires signed tokens; bearer requests with cookies need the CSRF header.
- A signed-out or revoked session is refused at once instead of after up to five minutes.
- Webhook connections are checked against the block list at connect time and never use a proxy.
- Backend responses carry `nosniff`, `no-referrer` and `X-Frame-Options: DENY`; auth responses are `no-store`.
- The API reference pages and their specs are not served in production.

- Email + password sign-up and sign-in work only under `NODE_ENV=test`.
- Phone codes are no longer generated or written to the log.
- Pending invitations are claimed only by a verified email or phone; a Google/Apple sign-in to an address someone registered without proving it removes that registration's password and sessions.
- The super-admin allowlist requires a verified email or phone.
- An Admin can no longer add an Owner or remove an Admin; a team always keeps an Owner; the account a personal team belongs to cannot be removed or demoted.
- `files.create` can no longer rewrite or read another member's file; no create path accepts a file URL; stored non-http(s) URLs are cleared by a migration; a team logo must be on the app's storage.
- Only the host of a live team is trusted besides `ALLOWED_ORIGINS` (https, default port in production); other subdomains of the root, nested and reserved labels are refused. The super-admin API never accepts a team host.
- The backend refuses to start when `S3_PUBLIC_URL` is under `TENANT_ROOT_DOMAIN`.
- A team's logo and app icon must be pictures on the app's own storage.
- Assigning a team's subdomain is recorded in the operator audit trail.

## [1.1.0] - 2026-07-03

### Added

- Same-origin reverse proxy support: oRPC routes relocated under `/api/user-app`, with a new `user_app` request handler.
- User-created Novu workflow (`user_created.workflow.ts`) and deployment sync script (`scripts/deploy_novu_sync.sh`); Novu workflows now sync automatically on boot.
- `dayjs` dependency.

### Changed

- Improved RPC URL resolution.
- CSRF rejection logs now normalize header values to strings; CSRF and healthcheck error logging is more informative.
