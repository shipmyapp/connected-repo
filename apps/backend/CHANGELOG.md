# Changelog

All notable changes to this package are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Redis 7 as a required service (`REDIS_URL`): `configs/redis.config.ts` (`getRedis`, `closeRedis`), `utils/redis.utils.ts` (`getRedisStatus`, `redisReady`); `ioredis` ^5.11.1. Compose (`redis` service in `docker-compose.dev.yml` and `docker-compose.yml`) and CI run one.
- `/health` reports `redis: "ok" | "down"`.
- `createRateLimitMiddleware` takes an async `bucketFn` and a `failClosed` option.

### Changed

- Rate limits are a token bucket in Redis (one Lua script, keys `rl:<bucket key>`), replacing the Postgres optimistic-lock bucket; limits, windows and 429 responses are unchanged. When Redis is down, limits let requests through.

### Deprecated

- The `rate_limits` table and `RateLimitTable` are no longer used; a later release drops them.

## [1.1.0] - 2026-07-03

### Added

- Same-origin reverse proxy support: oRPC routes relocated under `/api/user-app`, with a new `user_app` request handler.
- User-created Novu workflow (`user_created.workflow.ts`) and deployment sync script (`scripts/deploy_novu_sync.sh`); Novu workflows now sync automatically on boot.
- `dayjs` dependency.

### Changed

- Improved RPC URL resolution.
- CSRF rejection logs now normalize header values to strings; CSRF and healthcheck error logging is more informative.
