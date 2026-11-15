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

## [1.1.0] - 2026-07-03

### Changed

- `.dockerignore` updated to support the new frontend Docker build (includes backend sources for type resolution).
