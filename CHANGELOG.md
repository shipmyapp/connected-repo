# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Git hooks in `.githooks/` (installed by `yarn install`): Biome on staged files before a commit; knip and the typecheck before a push.
- CI: run on demand (`workflow_dispatch`), a knip step, a Redis service container for the backend tests.
- Redis 7 next to Postgres in `docker-compose.dev.yml` and `docker-compose.yml`; the backend requires it (`REDIS_URL`) for its rate limits (see `apps/backend/CHANGELOG.md`).
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

### Changed
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
- Unused dependencies: `dayjs` and `@types/node-cron` (backend), `axios`, `mp4box` and `zustand` (frontend), `@types/react-dom` (ui-mui).
- Unused helpers reported by knip: the pg-tbus task query module, the dayjs time-zone helper, `isSystemContext`.

### Fixed
- Switching teams on the profile page silently reverted: better-auth's 5-minute session cookie cache handed the loader the old team. The loader now reads the session uncached once after a switch (a one-shot flag, `session_refresh.client.ts`), and the offline auth cache is re-saved with the new team.
- The theme snapped back after every toggle (the theme context handed out a new setter on each render); toasts drew white on white under the "system" theme.
- A top-level crash rendered a fallback that itself threw (`useRouteError()` outside the router).

### Security
- CI runs with a read-only token and SHA-pinned actions (Dependabot keeps them current).
- The OpenAPI super-admin surface (`/super-admin/`) requires `x-csrf-token: orpc` in production and staging.

## [1.1.0] - 2026-07-03

### Changed

- `.dockerignore` updated to support the new frontend Docker build (includes backend sources for type resolution).
