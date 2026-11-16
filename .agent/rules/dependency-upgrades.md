---
trigger: always_on
---

## Dependency Upgrades

- In-range upgrades together, in groups, gate after each group.
- One major per pull request.
- better-auth, @better-auth/core and @better-auth/oauth-provider: one exact version, moved together.
- All @orpc/* on one version; all @sentry/* on one release line (@sentry/vite-plugin moves to 11 with the SDK); @opentelemetry/* on one line (2.x while Sentry is 10), @opentelemetry/api below 1.10 with Sentry 10.
- pqb is the version orchid-orm depends on.
- @types/node follows the Node major in .nvmrc.
- Change ranges and run `yarn install`; never delete and regenerate `yarn.lock`. Merge avoidable duplicates afterwards (one zod, React, Vite, pg, `@types/node`, `@better-auth/core`, `@opentelemetry/api`).
