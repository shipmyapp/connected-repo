# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-07-03

### Added

- Same-origin reverse proxy support: oRPC routes relocated under `/api/user-app`, with a new `user_app` request handler.
- User-created Novu workflow (`user_created.workflow.ts`) and deployment sync script (`scripts/deploy_novu_sync.sh`); Novu workflows now sync automatically on boot.
- `dayjs` dependency.

### Changed

- Improved RPC URL resolution.
- CSRF rejection logs now normalize header values to strings; CSRF and healthcheck error logging is more informative.
