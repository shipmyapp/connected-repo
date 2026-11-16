---
trigger: always_on
---

## Dependency Upgrades

- In-range upgrades together, in groups, gate after each group.
- One major per pull request.
- better-auth, @better-auth/core and @better-auth/oauth-provider: one exact version, moved together.
- All @orpc/* on one version; all @sentry/* on one version, @sentry/vite-plugin included (it is on the SDK's version line). @opentelemetry/api is one copy, the version Firebase pins; @opentelemetry/instrumentation (peer of @orpc/otel) is the newest release that accepts it.
- A Sentry upgrade keeps `dataCollection` explicit in the backend and the frontend and passes `yarn check:sentry` (the built backend against a local stand-in for Sentry).
- pqb is the version orchid-orm depends on.
- @types/node follows the Node major in .nvmrc.
- Change ranges and run `yarn install`; never delete and regenerate `yarn.lock`. Merge avoidable duplicates afterwards (one zod, React, Vite, pg, `@types/node`, `@better-auth/core`, `@opentelemetry/api`).
