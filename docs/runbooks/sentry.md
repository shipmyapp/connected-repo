# Sentry

Two Sentry projects: the frontend (`VITE_SENTRY_DSN`, baked into the bundle) and the backend (`SENTRY_DSN`, read at runtime). Each is off while its DSN is blank. The values are in `deploy/prod.env.example`; how they reach the images is in `deploy/README.md`.

## What the code sends

| | Frontend (`apps/frontend/src/instrumentation.ts`) | Backend (`apps/backend/src/otel.sdk.ts`) |
|---|---|---|
| Errors | every error, except network noise and extension errors (`IGNORED_ERRORS`, `denyUrls`) | every captured error |
| Traces | `VITE_SENTRY_TRACES_SAMPLE_RATE`, else 0.3; none in development | `SENTRY_TRACES_SAMPLE_RATE`, else 0.1 in production and 1.0 elsewhere; a request continuing a browser trace keeps the browser's decision; health checks and the tunnel never traced; database and Redis work outside a request (crons, the pg-tbus poller) never starts a trace |
| Replays | sessions `VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, else 0; on error `VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`, else 1; text, inputs and media masked | — |
| Profiles | browser profiling during traces | `SENTRY_PROFILES_SAMPLE_RATE`, else 0 |
| Environment | `VITE_SENTRY_ENV`, else the build's `NODE_ENV` | `SENTRY_ENVIRONMENT`, else `NODE_ENV` |
| Personal data | `dataCollection` (`utils/sentry_scrub.ts`): the user by id only, no IP, cookies, headers, bodies or query strings | `dataCollection`: the user by id only, no IP, cookies, bodies, query strings or database query data; header values only for `accept`, `content-type`, `content-length`, `user-agent`; bound SQL values, client addresses and Redis command arguments stripped from spans |
| Logs | `console.warn` and `console.error` (`consoleLoggingIntegration`) | none: pino lines are breadcrumbs on errors |
| Transport | direct; the same-origin tunnel `/api/sentry-tunnel` (proxied by the frontend nginx to Sentry's ingest) only after a direct send fails while online | direct |

URLs are grouped by shape on both sides: ULID, UUID and long numeric path segments become `:id`, and the query string is dropped, in events, spans and breadcrumbs.

## Tracing

Sentry 11 sends spans as they finish (span streaming); there are no transaction events. A request is one trace: the backend's `http.server` span, the oRPC procedure span under it (`orpc.<router>/<procedure>`), and the Postgres and Redis spans under that; a browser request carries `sentry-trace`, `baggage` and `traceparent`, so the trace starts in the browser. Search and alert on spans (`span.op:http.server`, `is_segment:true`), not on transactions.

Sentry owns the spans (ADR-055): it instruments HTTP, Postgres and Redis itself and, with `enableOpenTelemetrySetup`, takes in the spans oRPC and Better Auth make through `@opentelemetry/api`. Nothing else receives traces. Outbound requests carry W3C `traceparent` next to Sentry's headers (`propagateTraceparent`), so another service can continue a trace.

## Proving what is sent

`yarn check:sentry` (CI runs it after the tests) starts the built backend against the test database with a DSN pointing at a local stand-in for Sentry, makes real requests carrying a cookie, a bearer token, an `x-api-key`, other headers, a body and a query string with marker values, and checks every envelope: the spans nest, no marker and no client IP appears, ULIDs arrive as `:id`, health checks and an idle server send nothing, an error arrives in its request's trace, profiling follows `SENTRY_PROFILES_SAMPLE_RATE`. It fails if the server sends nothing. Run `yarn build` and `yarn test:db:setup` first. A change to `otel.sdk.ts` or a Sentry upgrade must keep it green.

## Environment

Backend (runtime; a change needs a restart):

| Key | Meaning |
|---|---|
| `SENTRY_DSN` | The backend project's DSN. Blank: off. |
| `SENTRY_ENVIRONMENT` | `production`, `staging`, … Blank: `NODE_ENV`. |
| `SENTRY_RELEASE` | Overrides the release name. Leave blank (see Releases). |
| `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE` | 0–1. Blank: the defaults above. |

Frontend (build args; a change needs a redeploy):

| Key | Meaning |
|---|---|
| `VITE_SENTRY_DSN` | The frontend project's DSN. Blank: off. The frontend nginx also reads it (as `SENTRY_DSN`) for the tunnel and the CSP's report-uri. |
| `VITE_SENTRY_ENV` | `production`, `staging`, … |
| `VITE_SENTRY_ORG`, `VITE_SENTRY_PROJECT` | Where source maps are uploaded. |
| `VITE_SENTRY_AUTH_TOKEN` | A **build secret** (compose `secrets:`, Dokploy Build-time Secrets), never a build arg. Blank: no source-map upload. |
| `VITE_SENTRY_TRACES_SAMPLE_RATE`, `VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` | 0–1. Blank: the defaults above. |

## Releases

Each deploy is its own release, named after the commit the image was built from:

- Frontend: `${VITE_OTEL_SERVICE_NAME}@<short commit>`. The Docker build reads the commit from `.git` in the build context (`.build-sha`) and, with the auth token set, uploads the source maps for that release (`SENTRY_UPLOAD_SOURCEMAPS`, passed through by `turbo.json`'s `passThroughEnv`). A local `yarn build` never uploads.
- Backend: `${OTEL_SERVICE_NAME}@<short commit>`, from the image's `apps/backend/.build-sha`. `SENTRY_RELEASE` overrides it.

A build without `.git` (a tarball) falls back to the package version for both. The backend prints `Sentry: on (environment …, release …)` or `Sentry: off` on every start.

## In Sentry, once, by hand

- **Self-hosted Sentry**: 26.4.2 or later (Sentry 11 SDKs).

- **Settings → Projects → each → Inbound Filters**: on for browser extensions, localhost, legacy browsers and web crawlers. Filtered events do not count.
- **Settings → Subscription → Spike protection**: on, so one runaway loop cannot spend the month.
- **Settings → Security & Privacy**: Data Scrubber and "Use default scrubbers" on; "Prevent storing of IP addresses" on.
- **Alerts**: an issue alert for new issues (high priority) to email.
- **Security Headers**: CSP reports from the report-only policy arrive under the frontend project's Issues as `csp` events. Enforce the policy once they are clean (`CSP_ENFORCE=true`; the policy is in `apps/frontend/nginx.security-headers.inc.template`).
