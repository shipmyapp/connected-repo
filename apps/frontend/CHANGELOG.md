# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
