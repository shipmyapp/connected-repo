# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `docker-compose.prod.yml` for a Dokploy Compose deploy (production and staging from `deploy/prod.env.example` / `deploy/staging.env.example`, Traefik labels, a DNS-challenge wildcard certificate for team hosts, bundled Postgres and Redis behind profiles), and `deploy/dokploy/` for one Dokploy Application per Dockerfile (Swarm start-first); runbook `deploy/README.md`.
- One shared dependency install for all three images (`manifests`/`deps` stages, BuildKit cache `yarn-monorepo`); the superadmin console has its own nginx image.
- `yarn check:deploy`: the env schemas, example env files, build args, compose and deploy files agree, and the shared install stages are identical. CI runs it, validates the compose files, and builds and runs the three images (`scripts/check-images.sh`).
- Security headers on both nginx images; a report-only Content-Security-Policy on the app (`CSP_ENFORCE=true` enforces it), reported to Sentry.
- The superadmin console and a persistent Redis in the dev stack; `docs/runbooks/sentry.md` and `docs/runbooks/launch-checklist.md`.

- Delete my account from the profile: after leaving or deleting your teams, a 30-day grace period during which you can keep the account; then everything is deleted, including uploaded files, and your other devices erase their offline copy.
- Download my data: one JSON file of your own data from the profile.
- "Where you're signed in": see your sessions and sign out of any other device, or all of them.
- Leave a team; delete a team from the profile.
- Terms and Privacy: links on the sign-in page and the profile (`VITE_TERMS_URL`, `VITE_PRIVACY_URL`), a recorded agreement asked again when `LEGAL_VERSION` changes, and placeholder texts in `docs/legal/` that a fork must replace.
- Operator runbook for account deletion; the console shows each account's deletion state and can keep or delete-now a requested account, both recorded in the audit trail.

- Application MCP at `/mcp`: people connect Claude, ChatGPT and other AI apps to their account through OAuth 2.1 (Better Auth OAuth provider, dynamic registration, Client ID Metadata Documents, PKCE, opaque hashed tokens) and use them on their teams and journal (`whoami`, `list_teams`, `list_team_members`, `list_journal_entries`, `get_journal_entry`, `list_prompts`, `create_journal_entry` with preview and confirmation).
- Consent screen at `/oauth/consent` and "Connected apps" on the profile (narrow to read-only, disconnect, latest changes).
- `MCP_PUBLIC_URL` to serve the MCP on its own host; runbook `docs/runbooks/connected-apps.md`; MCP Registry skeleton in `deploy/mcp-registry/`.
- Team invitation emails and a test push through Novu; workflows kept in code and in the Novu dashboard, the newer winning at boot (see `apps/backend/CHANGELOG.md`).
- Skill `novu-pull` and the AGENTS rule "Novu workflows and templates".

- Git hooks in `.githooks/` (installed by `yarn install`): Biome on staged files before a commit; knip and the typecheck before a push.
- CI: run on demand (`workflow_dispatch`), a knip step, a Redis service container for the backend tests.
- Redis 8 next to Postgres in `docker-compose.dev.yml` and `docker-compose.prod.yml`; the backend requires it (`REDIS_URL`) for its rate limits (see `apps/backend/CHANGELOG.md`).
- Light / Dark / System on the profile page, saved to the account and kept for offline start.
- `packages/ui-mui`: `ConfirmDialog`, `When` + `utils/relative_time`, `AppErrorBoundary`, `ErrorScreen`, `AppToastContainer`, `DrawerTransition`; every dialog opens as a drawer; fields type at 16px on touch screens.
- `packages/zod-schemas/src/env_utils.ts`: blank-means-unset env primitives.
- The theme's accessibility floor: focus ring, reduced motion, 44px touch targets on touch screens.
- Back closes an open dialog or drawer (`useBackCloses`).
- `apps/superadmin`: the operator console (Teams with members, Users, Feature flags, Audit) behind Google sign-in and the super-admin allowlist; `yarn dev` serves it on :5175.
- Backend: the super-admin router over oRPC at `/api/super-admin`; `listTeams`, `getTeam`, `listUsers`; `ping` returns the operator's name.
- `packages/ui-mui`: `QueryState`, `PageHeader`, `DataTable`, `utils/rpc_errors`, `utils/api_origin`.
- Operator audit trail: `operator_audit_log` and `withOperatorAudit` (every super-admin change with who, before, after, reason, IP); `auditList`; the console's Audit page.
- "Sign out everywhere" for an account from the console's Users page (`revokeUserSessions`, with a reason, audited).
- Team white-labelling on the team's own host: `<slug>.<root>` is the team's private, installable PWA with its own name, logo, colours, tab icon and manifest. Only members get in. The operator assigns the subdomain in the super-admin console; Owners and Admins edit the rest under Team Settings → Branding & private app.
- Installing the app works on Chromium (the library's dialog with Chrome's own prompt, Apple's steps on iPhone and Mac), with an Install card on the profile and install pictures in the manifest; a notification tap opens its screen in the window already open (see `apps/frontend/CHANGELOG.md`).
- One device record per account and device (installs, push address, permissions), named by the `app_device` cookie or a native app's `x-device-id`; "Not now" on the device asks comes back after 3, 7, 14, then 30 days (see `apps/backend/CHANGELOG.md`, `apps/frontend/CHANGELOG.md`).
- `packages/zod-schemas` runs its own tests (`test:run`): the device, install-try and ask rules.

### Changed
- Sentry 11 (`@sentry/*` and `@sentry/vite-plugin` 11.12.0) in the backend and the frontend. Sentry owns the backend's tracing: one `Sentry.init` instruments HTTP, Postgres and Redis, and takes in oRPC's procedure spans (and any span the app makes through `@opentelemetry/api`, the portable way to make one) through `enableOpenTelemetrySetup`; W3C `traceparent` goes out and is accepted in; spans are streamed, so there are no transaction events. Data collection is an explicit allow list in both apps (`dataCollection`; Sentry 11 would otherwise collect cookies, headers, bodies and database query data), and `yarn check:sentry` proves it against the built backend in CI.
- **Upgrade note:** self-hosted Sentry needs 26.4.2 or later. Dashboards, alerts and saved searches built on transactions must move to spans (`span.op:http.server`, `is_segment:true`); span names are low-cardinality now (a server span is named by its method, `GET`, with the path in `url.path`; a query by its operation and table, `SELECT "journal_entries"`).
- Runtime moved to Node 26 (engines, .nvmrc, Dockerfiles, CI). Docker images install Yarn 1.22.22 with npm. Sentry moved to 10.78 with it (its profiler ships Node 26 binaries for glibc and musl), and `tsx` to 4.23.
- The build scripts call `turbo`, `tsc-alias` and `vite` directly instead of through `npx`.
- Dependencies refreshed to the latest release inside each one's current major, and the lockfile deduplicated (one zod, one React, one `@opentelemetry/api` 1.9.x, one Vite). Known advisories (`yarn audit`) down from 362 to 7 (2 high, none critical) with the majors below; every one left waits on upstream (`@grpc/grpc-js` in Firebase's Firestore, which the app never bundles; Workbox's build tooling). Still on their current major: MUI 7, Sentry 10 with OpenTelemetry 2, Yarn 1 (reasons in `AGENTS.md`).
- Better Auth 1.7.25 (`better-auth`, `@better-auth/core`, `@better-auth/oauth-provider`), which clears its two critical advisories. The OAuth provider's new client, token and resource columns and tables come with migration `0017_oauth_provider_resources`. Signing out of the app ends the AI-app access tokens issued under that session; the app stays connected through its refresh token.
- Major upgrades: concurrently 10, dotenv 18, @hookform/resolvers 7, @mui/x-date-pickers 9 (on MUI 7), pdfjs-dist 6 (PDF thumbnails need Chrome 125+ or Safari 18+; older browsers attach without one), @novu/api 3, firebase 13, firebase-admin 14 (modular API), knip 6, Vite 8, Vitest 5, vite-plugin-pwa 2, react-router 8, ioredis 6 (kept on the RESP2 wire protocol), jsdom 31, TypeScript 7 (the native compiler; CONTRIBUTING.md has the editor setup), sharp 0.35 (icon generator). Images: nginx 1.30, Redis 8 (compose and CI); GitHub Actions checkout, setup-node and upload-artifact v7, still pinned by commit. pdf.js, the Novu SDK and Firebase Admin each clear an advisory.
- Biome 2.6. Markdown is not run through its formatter.
- The backend image smoke-tests its runtime stage against `apps/backend/.env.example`, which therefore passes the schema as committed.
- Docker builds upload source maps again (`turbo.json` passes `SENTRY_UPLOAD_SOURCEMAPS` through).
- The application MCP's own host (`MCP_PUBLIC_URL`) is `mcp.<root>`, routed by the team-host wildcard to the frontend nginx, which passes it to the backend; `mcp` is a reserved team slug.

- Sensitive actions ask you to sign in again when your session is older than 10 minutes.
- A personal team no longer accepts members.
- When the server ends a session, the device no longer opens offline with the old account.

- `better-auth` and `@better-auth/core` pinned to `1.5.0` (the OAuth provider plugin's exact peers).
- Signing in from an AI app's authorize request returns to that request instead of the dashboard.
- OAuth access tokens are refused on the oRPC routes.

- Biome no longer formats `apps/backend/src/novu/{workflows,layouts}` (files written by `novu:pull`).

- CI runs on `ubuntu-24.04` (Playwright 1.58 has no chromium for `ubuntu-latest` = 26.04); lint now fails the build.
- `apps/backend/.biome.json` extends the root config, so the backend is checked at 100 columns with the root's rules.
- `knip.jsonc` lists the service worker and the two module workers as frontend entries.
- `.dockerignore` excludes `.env` files at any depth; `.gitignore` keeps `.env.test` files and ignores `dump.rdb`.
- The root Biome formatter covers every package (its `includes` globs matched only files at the repository root); the whole repository is formatted with it.
- Packages that are imported directly are declared in their workspace's `package.json` (`pqb`, `@opentelemetry/core`, `@orpc/standard-server-node`, `@orpc/contract`, `@novu/js`, `workbox-strategies`).
- `packages/ui-mui` declares its peers as devDependencies too.
- `packages/zod-schemas` imports its own files relatively; the `@zod-schemas/*` and `@ui-mui/*` tsconfig aliases are gone.
- `zTimezone` accepts IANA zones only on input; the stored zone is read leniently by Better Auth.
- `turbo run test:run` builds dependencies first.

### Removed
- The backend's own OpenTelemetry SDK and the optional second trace destination `OTEL_TRACE_EXPORTER_URL` (remove it from deployments); the packages only it used: `@sentry/opentelemetry`, `@opentelemetry/core`, `exporter-trace-otlp-http`, `instrumentation-http`, `instrumentation-pg`, `resources`, `sdk-node`, `sdk-trace-node`.
- `docker-compose.yml` (Postgres and Redis only): `docker compose -f docker-compose.dev.yml up postgres redis` does the same.
- Unread env vars: `SESSION_SECRET`, `INTERNAL_API_SECRET`, `DB_SCHEMA`, `CRON_JOB_*`, `SUPRSEND_*`, `DOCKER_STOP_TIMEOUT`, the backend's `VITE_SENTRY_DSN`, the misnamed `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and the frontend image's `VITE_SENTRY_RELEASE` build arg (the build sets it from the commit).

- Unused dependencies: `dayjs` and `@types/node-cron` (backend), `axios`, `mp4box` and `zustand` (frontend), `@types/react-dom` (ui-mui).
- Unused helpers reported by knip: the pg-tbus task query module, the dayjs time-zone helper, `isSystemContext`.

### Fixed
- The dashboard's first-run redirect to a new entry no longer replaces a navigation the person started while their entries were loading (opening the profile from the dashboard could land on the new-entry page).
- The journal entry's attachment preview no longer remounts on every render of the entry (it was a component declared inside a component), so its fall-back from the thumbnail to the main image sticks.
- The backend image now ships the dependencies Yarn could not hoist (`apps/backend/node_modules`, e.g. `@better-auth/oauth-provider`); the server failed to start without them.
- The dev stack mounts Postgres 18's data volume where that image expects it (`/var/lib/postgresql`).
- CI's compose check gives the dev compose file all three example env files (it reads `apps/frontend/.env` and `apps/superadmin/.env` too), so it no longer stops on a missing file.

- Deleting a team now removes every member's access (members' devices drop it at their next sync) instead of leaving the deleted team usable.
- Deleting an account no longer deletes the shared teams it created.
- Shutdown now stops the silent-sync timer.

- Switching teams on the profile page silently reverted: better-auth's 5-minute session cookie cache handed the loader the old team. The loader now reads the session uncached once after a switch (a one-shot flag, `session_refresh.client.ts`), and the offline auth cache is re-saved with the new team.
- The theme snapped back after every toggle (the theme context handed out a new setter on each render); toasts drew white on white under the "system" theme.
- A top-level crash rendered a fallback that itself threw (`useRouteError()` outside the router).

### Security
- nginx no longer trusts a client's `X-Forwarded-For`: only the proxy in front (private ranges) is trusted, and the backend receives exactly one address, in every proxied location and in the dev sidecar. Per-address limits and the API key address allowlist can no longer be dodged with a forged header. `TRUSTED_PROXY_COUNT=1` in both deploy modes and the dev compose stack.
- `/robots.txt` on the API host disallows everything; the app's `robots.txt` keeps crawlers off `/api/`, `/mcp`, the OAuth documents and the sign-in and consent pages.

- Connected apps may register only `https:` or loopback `http:` (with a port) redirect URIs, without fragment or userinfo, by registration and by metadata document; the consent page navigates only to its own request's redirect URI.
- Metadata-document fetches are limited per IP and in total, registrations in total per day, and the number of registered apps is capped; apps nobody connected are removed after a week.
- Each `/mcp` call checks that the resource served is one the tokens were issued for.

- CI runs with a read-only token and SHA-pinned actions (Dependabot keeps them current).
- The OpenAPI super-admin surface (`/super-admin/`) requires `x-csrf-token: orpc` in production and staging.

## [1.1.0] - 2026-07-03

### Changed

- `.dockerignore` updated to support the new frontend Docker build (includes backend sources for type resolution).
