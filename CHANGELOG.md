# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Git hooks in `.githooks/` (installed by `yarn install`): Biome on staged files before a commit; knip and the typecheck before a push.
- CI: run on demand (`workflow_dispatch`), a knip step, a Redis service container for the backend tests.

### Changed
- CI runs on `ubuntu-24.04` (Playwright 1.58 has no chromium for `ubuntu-latest` = 26.04); lint now fails the build.
- `apps/backend/.biome.json` extends the root config, so the backend is checked at 100 columns with the root's rules.
- `knip.jsonc` lists the service worker and the two module workers as frontend entries.
- `.dockerignore` excludes `.env` files at any depth; `.gitignore` keeps `.env.test` files and ignores `dump.rdb`.
- The root Biome formatter covers every package (its `includes` globs matched only files at the repository root); the whole repository is formatted with it.
- Packages that are imported directly are declared in their workspace's `package.json` (`pqb`, `@opentelemetry/core`, `@orpc/standard-server-node`, `@orpc/contract`, `@novu/js`, `workbox-strategies`).

### Removed
- Unused dependencies: `dayjs` and `@types/node-cron` (backend), `axios`, `mp4box` and `zustand` (frontend), `@types/react-dom` (ui-mui).
- Unused helpers reported by knip: the pg-tbus task query module, the dayjs time-zone helper, `isSystemContext`.

## [1.1.0] - 2026-07-03

### Changed

- `.dockerignore` updated to support the new frontend Docker build (includes backend sources for type resolution).
