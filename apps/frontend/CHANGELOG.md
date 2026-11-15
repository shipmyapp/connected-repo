# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Component tests in jsdom (`// @vitest-environment jsdom`, `src/test/render.tsx`); `@testing-library/react`, `@testing-library/dom`, `jsdom`.
- `VITE_SENTRY_TRACES_SAMPLE_RATE`, `VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`.
- Removing a team member asks for confirmation.
- Team hosts: branded document, manifest, theme and navbar; the no-access page; the branding form with logo and icon upload.
- The Dockerfile takes `VITE_TENANT_ROOT_DOMAIN` as a build arg.
- RPC calls that are not team-scoped can pass `context: { noTeam: true }` and go out without waiting for the team header.

### Changed

- Offline journal entries are pushed 20 per request.
- Sentry: no reachability probe at boot (direct first, the same-origin tunnel after a failed send); no PII; masked replays; URLs lose their query and hash; spans and breadcrumbs normalised; one release-name helper for runtime and source maps.
- Blank `VITE_TEST_PASSWORD` / `VITE_OTEL_SERVICE_NAME` count as unset.
- E2E auth setup waits for the session cookie instead of network idle.
- Every dialog opens as a drawer.

### Removed

- The avatar's dropdown menu: the avatar opens `/profile`, which now holds Teams (switch, new team, team settings), Appearance and Sign out. The navbars show the active team's name as text.

### Fixed

- Switching team reads the session once past the cookie cache (`getSession` with `disableCookieCache`, in the loader) so the loader and the DataWorker agree on the new team instead of the cached one.
- Back after signing out could show a signed-in page from the back/forward cache; sign-in and sign-out now replace the history entry.
- Route errors and 404s render a page instead of a bare message.
- A Google sign-in that could not start did nothing; it now says so and is reported.
- The sign-in page no longer downloads the test fixture and faker.
- The time zone comes from the browser only; the plain-http IP lookup (blocked on https pages) is gone.
- A stray `@ts-ignore` in the PDF thumbnailer.

### Security

- Attachments open only http(s) URLs, in a new tab without opener.

## [0.1.0] - 2026-07-03

### Added

- Production Docker image with Nginx (`Dockerfile`, `nginx.conf.template`, `docker-entrypoint.envsh`) implementing a same-origin reverse proxy to the backend, plus build-time nginx config validation.
- Sentry envelope tunnel to bypass ad-blockers; git hash included in the Sentry release tag; secure sourcemap uploads via Docker build secrets.
- PWA installation persistence retry.

### Changed

- OAuth callback origin resolution hardened for reverse-proxy deployments.
- Improved abort detection in the oRPC client.
- Bundle analyzer no longer auto-opens in `vite.config.ts`.

### Fixed

- Service worker no longer interferes with backend routes; navigation denylist now covers `/api/*`.
- Improved SW update flow strategy.
- Reordered nginx entrypoint so Sentry variables are exported before template rendering.
