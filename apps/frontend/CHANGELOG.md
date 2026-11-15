# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Profile: "Where you're signed in", "Your data and account" (download my data, delete my account, with the teams to leave first and a fresh sign-in when needed), and Leave / Delete on each team row.
- `/account/deletion-pending` (Keep my account) and `/legal/accept` (agree once per `LEGAL_VERSION` when `VITE_TERMS_URL` and `VITE_PRIVACY_URL` are set); Terms and Privacy links on the sign-in page and the profile.
- `wipeAllLocalData()`: deleting the account removes every local database, the stored files and the offline sign-in on this device; a device of a deleted account erases its copy the next time it opens online.

- The consent screen at `/oauth/consent` for an AI app asking to connect (platform named by its redirect host, write as the person's choice, navigation only to the request's own redirect URI) and "Connected apps" on the profile (narrow to read-only, disconnect, latest changes, the address to add).
- Signing in from an AI app's authorize request returns to it (the social `callbackURL` is the authorize URL; a copy is kept for the tab).
- The service worker and the dev proxy leave `/mcp` and `/.well-known/*` to the backend; nginx routes them there.

- Each device reports what it is and can do; the install offer and the profile's Install card follow this very device (an iPhone's Safari knows its Home Screen app).
- "Not now" on the notification asks comes back after 3, 7, 14, then 30 days, the same on every device.

- Component tests in jsdom (`// @vitest-environment jsdom`, `src/test/render.tsx`); `@testing-library/react`, `@testing-library/dom`, `jsdom`.
- `VITE_SENTRY_TRACES_SAMPLE_RATE`, `VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`.
- Removing a team member asks for confirmation.
- Team hosts: branded document, manifest, theme and navbar; the no-access page; the branding form with logo and icon upload.
- The Dockerfile takes `VITE_TENANT_ROOT_DOMAIN` as a build arg.
- RPC calls that are not team-scoped can pass `context: { noTeam: true }` and go out without waiting for the team header.
- Install dialog from `@khmyznikov/pwa-install` 0.7.0: Chrome's own install, Apple's Add to Home Screen steps, iPhone in-app browsers sent to Safari, Add to Dock on a Mac; the app's sheet for Android browsers other than Chrome and the menus. The sheets show the team's own name and icon on its host.
- Install card on the profile, install pictures in the manifest (`screenshots`), manifest `id`, `description`, `launch_handler`, `handle_links`.
- `scripts/generate-icons.mjs` and `scripts/install-shots.mjs`; the maskable icon and a monochrome notification badge.
- A notification tap opens its screen in the window already open, without a reload.

### Changed

- A 401 from the server clears the offline sign-in, so a session ended elsewhere no longer opens offline.
- Team settings offer "Add Member" only for a shared team.

- Push registration rides the device report; no push token is cached in the browser; switching push off is per account on a shared device.

- Offline journal entries are pushed 20 per request.
- Sentry: no reachability probe at boot (direct first, the same-origin tunnel after a failed send); no PII; masked replays; URLs lose their query and hash; spans and breadcrumbs normalised; one release-name helper for runtime and source maps.
- Blank `VITE_TEST_PASSWORD` / `VITE_OTEL_SERVICE_NAME` count as unset.
- E2E auth setup waits for the session cookie instead of network idle.
- Every dialog opens as a drawer.
- The version label shows the package version, with the build commit in its tooltip.

### Removed

- `utils/device.utils.ts` (replaced by `lib/device/device-env.ts`); the `push.fcmToken`, `push.fcmTokenRegisteredAt`, `push.bannerDismissed`, `push.initialPromptShown` and `pwa.installOfferAt` keys (cleared on start).

- The avatar's dropdown menu: the avatar opens `/profile`, which now holds Teams (switch, new team, team settings), Appearance and Sign out. The navbars show the active team's name as text.

### Fixed

- The built page carried two manifest links (its own and the PWA plugin's), so a team's host still linked the shared app's manifest; it now carries one.

- Install did nothing on Chromium (the library was mounted with `disable-chrome`).
- Every push notification showed twice; the worker's icon path pointed at a missing file; a tap on a push without a link opened nothing.
- `maskable-icon-512x512.png` was listed in the manifest but missing.
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
