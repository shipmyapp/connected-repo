# Deploying connected-repo on Dokploy

Two ways, from the same three Dockerfiles. Pick one per environment. If this is your first Dokploy deploy, read "One-time setup" first, then the section for the mode you chose, then "Checking a deployment".

| | **Compose mode** | **Application mode** |
|---|---|---|
| Dokploy object | one Compose app | one Application per service |
| File | `docker-compose.prod.yml` | `apps/{backend,frontend,superadmin}/Dockerfile` |
| Env | one `.env` (`deploy/prod.env.example` or `deploy/staging.env.example`) | the same file as the environment's shared variables, referenced by `deploy/dokploy/*` |
| Postgres, Redis | bundled (`COMPOSE_PROFILES=postgres,redis`), Dokploy-run or managed | Dokploy-run (Create → Database) or managed |
| Routing | Traefik labels in the compose file | Dokploy Domains + `deploy/dokploy/tenants.traefik.yml` |
| Updates | containers recreated: a few seconds of 502s | Swarm start-first: no downtime, automatic rollback |

Choose Application mode for a production that must not blink on deploy; Compose mode is the quickest to set up (one app, one env file).

Services in both:
- **backend**: API, crons and pg-tbus in one process (there is no worker container). It is never published. It applies migrations as it starts, then listens on 3000. Health: `GET /` returns `"status":"ok"`.
- **frontend**: nginx with the SPA. It serves the shared app host and every team host (`<team>.<root>`), and proxies `/api/*`, `/mcp` and the OAuth `/.well-known/*` documents to the backend. With `MCP_PUBLIC_URL` set it also passes the application MCP's own host (`mcp.<root>`) to the backend. Health: `GET /healthz`.
- **superadmin**: nginx with the operator console. It proxies `/api/auth/*` and the super-admin router (`/api/super-admin/*`) only, and answers 404 for the rest of `/api/`. Health: `GET /healthz`.
- **Postgres 18** and **Redis 7**: both required.

Each nginx finds the backend through `BACKEND_UPSTREAM` (`host:port`; image default `backend:3000`).

## One-time setup

1. **Hosts.** Pick a root domain for the app, `<root>` (e.g. `example.com`); it is `TENANT_ROOT_DOMAIN`. The shared app lives on `app.<root>` (`APP_HOST`), the console on `sa.<root>` (`SUPERADMIN_HOST`), each team on `<slug>.<root>`. The console's first label must be one of `RESERVED_TENANT_SLUGS` (`packages/zod-schemas/src/tenant.utils.ts`: `sa`, `admin`, `superadmin`, …), or the app would read it as a team's host.
2. **DNS.** Point `app.<root>`, `sa.<root>` and `*.<root>` (team hosts, and `mcp.<root>` if the MCP gets its own host) at the server.
3. **Wildcard certificate.** Let's Encrypt issues `*.<root>` only over a DNS challenge. Add a resolver named `letsencrypt-dns` to Dokploy's Traefik (Dokploy → Settings → Traefik → `traefik.yml`), and give Traefik the DNS provider's API token as an environment variable (Cloudflare shown, `CF_DNS_API_TOKEN`):

   ```yaml
   certificatesResolvers:
     letsencrypt-dns:
       acme:
         email: ops@example.com
         storage: /etc/dokploy/traefik/dynamic/acme-dns.json
         dnsChallenge:
           provider: cloudflare
   ```

   Another name? Set `TLS_WILDCARD_CERT_RESOLVER`. The app and console hosts use Dokploy's own `letsencrypt` resolver (`TLS_CERT_RESOLVER`).
4. **Database.**
   - Bundled (Compose mode): leave `postgres` in `COMPOSE_PROFILES` and set `DB_HOST=<STACK_NAME>-postgres`.
   - Dokploy-run: `DB_HOST` is its internal service name, `DB_SSL=disable`.
   - Managed: create the database and user, allow the server's IP, set `DB_SSL=verify-full` and paste the provider's CA into `DB_SSL_CA` (one line, `\n` for the line breaks).
5. **Redis.**
   - Bundled (Compose mode): leave `redis` in `COMPOSE_PROFILES` and set `REDIS_URL=redis://<STACK_NAME>-redis:6379`.
   - Otherwise: the Dokploy-run or managed URL.
6. **Object storage.** The template serves attachments and team pictures **by public URL** (`generatePublicUrl` in `apps/backend/src/utils/cdn.utils.ts`: `S3_PUBLIC_URL`, or the endpoint, plus the object key). So the bucket's **objects must be publicly readable** through that URL, and anyone who has (or guesses) a URL can fetch the file without signing in, for as long as the object exists. What keeps it reasonable: keys carry the team id and a ULID (not guessable by enumeration), uploads are presigned per request and only for the types the presign allows (no SVG; see `generate_presigned_url.cdn.services.ts`), deleting an account queues its objects for deletion, and the bucket must not allow **listing**. Configure:
   - public read on objects through the public host, **no public list**, no public write;
   - a key scoped to this bucket, with put, get, head and delete only;
   - the public host (`S3_PUBLIC_URL`) on **another registrable domain than the app**: never `cdn.<root>`, any host under `TENANT_ROOT_DOMAIN`, or any host under the cookie domain `PROD_COOKIE_DOMAIN` (the backend refuses to start when it is under `TENANT_ROOT_DOMAIN`; the cookie domain is yours to check). Every subdomain of that domain receives the session cookie, and a file served from it could read or plant cookies;
   - CORS: `PUT` from the app host and the team hosts (list them, or allow the root's subdomains if your provider has no other way), headers `content-type`, `content-length`;
   - the endpoint's origin in `CSP_CONNECT_EXTRA`.

   If files must not be public (personal documents, health data), the template does not do that yet: it needs short-lived signed read URLs served by the backend instead of `generatePublicUrl`. Plan it before launch.
7. **Only the app under the root.** All of `TENANT_ROOT_DOMAIN`'s subdomains receive the session cookie (`PROD_COOKIE_DOMAIN=.<root>`). Put marketing, docs and status pages, and anything that serves user content, on another registrable domain, and remove every DNS record under the root that points at a service you no longer run (a dangling CNAME someone else can claim is a session takeover).
8. **Client addresses (forwarded headers).** The backend limits requests per client address and the API product can restrict a key to addresses, so the address must be the client's, not one the client wrote into a header. The chain is: client → Dokploy's Traefik → frontend or superadmin nginx → backend, for every host (the MCP's own host included).
   - Traefik is the edge. With its default entry-point settings (no `forwardedHeaders.trustedIPs`, `insecure` off) it does not trust a client's `X-Forwarded-*` and sets `X-Forwarded-For` from the connecting address. Not verified for every Dokploy version's generated `traefik.yml`: check Dokploy → Settings → Traefik → `traefik.yml` has no `forwardedHeaders.insecure: true` on `web`/`websecure`, and run the check under "Checking a deployment".
   - The nginx containers trust `X-Forwarded-For` only from private ranges (10/8, 172.16/12, 192.168/16: where Traefik connects from) and send the backend exactly one address, overwriting `X-Forwarded-For` and `X-Real-IP`.
   - The backend's `TRUSTED_PROXY_COUNT` is `1` in both deploy modes (and in the dev compose stack): it takes the `X-Forwarded-For` entries plus the connecting address and uses the entry one place from the right, which is the client nginx named. `0` only when the backend runs directly on the host (`yarn dev`), with nothing in front of it.
   - Behind a CDN or another proxy (Cloudflare proxied DNS, a load balancer): add its published address ranges to Traefik's `entryPoints.websecure.forwardedHeaders.trustedIPs` **and** as `set_real_ip_from` lines in both nginx templates. Otherwise every request looks like it comes from the CDN.
   - Never publish the backend's port: a direct connection could write its own header.
9. **Google OAuth.** Redirect URI `https://<app host>/api/auth/callback/google`. Add the app, console and team origins as authorised JavaScript origins.
10. **Apple sign-in** (optional): return URL `https://<app host>/api/auth/callback/apple`. `APPLE_PRIVATE_KEY` goes on one line in double quotes with `\n` line breaks. Check that Dokploy kept the quotes: `docker exec <backend> printenv APPLE_PRIVATE_KEY | head -c 40`.
11. **Novu.** No bridge and no post-deploy step: at boot the backend brings the Novu environment of `NOVU_SECRET_KEY` in line with the workflows in code (`apps/backend/src/novu/`). Set the email integration and the push (FCM) integration in the Novu dashboard.
12. **The application MCP's own host** (optional). Blank `MCP_PUBLIC_URL`: AI apps connect to `https://<app host>/mcp`. To give it a host of its own, use `mcp.<root>` (a reserved team slug): the wildcard route and certificate already cover it, and the frontend nginx passes that host to the backend. Set `MCP_PUBLIC_URL=https://mcp.<root>`; both the backend and the frontend read it. See `docs/runbooks/connected-apps.md`.

## Compose mode

1. Dokploy → your project → Create Service → **Compose** → Docker Compose. Source: this repository and the deploy branch (`main` for production, `staging` for staging).
2. **Compose Path:** `./docker-compose.prod.yml` (staging uses the same file).
3. **Environment:** paste `deploy/prod.env.example` (or `deploy/staging.env.example`) and fill in every `<…>`. Dokploy writes it to `.env` beside the compose file. `STACK_NAME` must be unique on the server.
4. **Domains:** add none in the UI. The Traefik labels in the file route the hosts and attach `dokploy-network`.
5. **Deploy.** Dokploy builds the three images on the server, starts Postgres and Redis (if bundled), then the backend (which migrates before it listens), then the two nginx containers once the backend is healthy.

The backend has `stop_grace_period: 310s`: graceful shutdown drains HTTP, then pg-tbus tasks, and force-exits after `AGENT_TASK_TIMEOUT` + 10 s.

## Application mode

Create the database services first if Dokploy runs them (Create Service → Database → PostgreSQL 18, and Redis 7). Then three Applications: Create Service → **Application**, provider GitHub, this repository, the deploy branch, Build Type **Dockerfile**, Docker Context Path `.`. Leave Docker Build Stage empty: each Dockerfile's last stage is the one that ships.

| | `backend` | `frontend` | `superadmin` |
|---|---|---|---|
| Dockerfile Path | `apps/backend/Dockerfile` | `apps/frontend/Dockerfile` | `apps/superadmin/Dockerfile` |
| Environment Settings | `deploy/dokploy/backend.env` | `deploy/dokploy/frontend.env` | `deploy/dokploy/superadmin.env` |
| Build-time Arguments | none | `deploy/dokploy/frontend.build-args` | `deploy/dokploy/superadmin.build-args` |
| Build-time Secrets | none | `VITE_SENTRY_AUTH_TOKEN=${{environment.VITE_SENTRY_AUTH_TOKEN}}` | none |
| Watch Paths | `apps/backend/**`, `packages/**`, `package.json`, `yarn.lock`, `turbo.json` | `apps/frontend/**`, `packages/**`, `package.json`, `yarn.lock`, `turbo.json` | `apps/superadmin/**`, `apps/backend/src/routers/super_admin/**`, `packages/**`, `package.json`, `yarn.lock`, `turbo.json` |
| Domains | none (reached through the nginx apps) | the app host, port 80, HTTPS | the console host, port 80, HTTPS |

1. Paste the filled-in `deploy/prod.env.example` into Dokploy → the project → the environment → **Environment Variables** (shared). It is the only place a production value lives; the Compose-only keys (`STACK_NAME`, `APP_HOST`, `SUPERADMIN_HOST`, `COMPOSE_PROFILES`, `TLS_*`) are simply unused here.
2. In `frontend.env` and `superadmin.env`, replace `<backend-app-name>` with the backend Application's **App Name**. Swarm gives that name a stable virtual IP.
3. **Team hosts:** copy `deploy/dokploy/tenants.traefik.yml` into Dokploy → Settings → Traefik → File System → `dynamic/`, with your root and the frontend's App Name. It also routes `mcp.<root>`.
4. **Zero downtime:** on each Application, Advanced → Swarm Settings → Update Config, paste `deploy/dokploy/swarm-update-config.json`. Swarm starts the new container, waits for its health check, then stops the old one, and rolls back if the new one never turns healthy. If your Dokploy version offers a stop grace period, set the backend's to 310 s; otherwise Swarm's default of 10 s applies and a long pg-tbus task can be cut short (it is retried).
5. **First deploy order:** `backend` (it creates the schema), then `frontend` and `superadmin`. An nginx container exits at start while its upstream name does not resolve, and restarts until it does.

## The shared build cache

All three Dockerfiles begin with the same two stages, `manifests` and `deps`, line for line:
- `manifests` prunes the monorepo for all three apps (`turbo prune`, turbo pinned to the lockfile's version) and records the commit in `.build-sha`.
- `deps` runs one `yarn install` into one BuildKit cache mount (`id=yarn-monorepo`).

BuildKit keys a stage by its exact text and inputs, so the three builds produce **one** cached `deps` layer, not three. The first app to build after a dependency change installs. The others, and every later build with the same `package.json` files and `yarn.lock`, reuse it. The backend's production-only install reads the same cache mount, so nothing is downloaded twice. `--network-timeout 600000` lets a slow registry finish, and a failed install keeps what it fetched for the retry.

How each mode gets the sharing:
- **Compose mode:** `docker compose build` builds the three services in one BuildKit session, so identical stages run once.
- **Application mode:** each Application builds separately on the same server with Docker's default BuildKit builder. The cache and the layers live in that builder, so the second and third builds find them.

The sharing holds on one machine only: if a remote build server is configured, all three apps must build there.

**Change the two stages in all three files at once.** One differing character gives that app its own install. `yarn check:deploy` (run by CI) fails when they differ, and CI's images job checks that the second and third builds reuse the install. The Node version is the `ARG NODE_VERSION` line at the top of each Dockerfile.

Old layers stay until pruned. Turn on Dokploy's daily Docker cleanup for the server, or prune by hand when `docker system df` grows: `docker builder prune -af --filter until=168h` and `docker image prune -af --filter until=168h`.

## Environment

- `deploy/prod.env.example` and `deploy/staging.env.example` list every key a deploy sets; `apps/*/.env.example` list every key each app reads. `yarn check:deploy` keeps them, the schemas, the Dockerfiles' build args and `deploy/dokploy/*` in step.
- **A blank value means "not set" everywhere:** compose interpolates with `${X:-}`; the frontend and console builds unset empty `VITE_*` before Vite runs; the nginx entrypoints default a blank `BACKEND_UPSTREAM`; the backend drops blank values before its schema (`env.config.ts`).
- **`VITE_*` keys are baked in at build time:** a change needs a **redeploy** of the SPA. Every other key needs a restart of the backend, or of the frontend nginx for `CSP_CONNECT_EXTRA`, `CSP_ENFORCE`, `MCP_PUBLIC_URL` and `SENTRY_DSN`.
- **Never change `OTEL_SERVICE_NAME` on a live environment:** it is also the pg-tbus queue name.
- `BETTER_AUTH_SECRET` must not be the example value: the backend refuses to start in production or staging with it.

## Staging

Staging is the same compose file (or the same three Applications) on its own server, with `deploy/staging.env.example`: hosts `staging.<domain>` (the app, also the tenant root), `sa-staging.<domain>` and `*.staging.<domain>`.

Its app and console hosts share only `.<domain>` with production, so both put the session cookie there (`PROD_COOKIE_DOMAIN=.<domain>`). Staging therefore names its cookies apart with `AUTH_COOKIE_PREFIX`; production keeps Better Auth's default. Changing a live prefix signs everyone out. A separate staging domain avoids the question entirely.

## Checking a deployment

- `curl -s https://<app host>/healthz` and `curl -s https://<console host>/healthz` print `ok`.
- `docker exec <backend container> curl -s localhost:3000/` shows `"status":"ok"` and `"redis":"ok"`.
- `curl -sI https://<app host>/ | grep -i content-security` shows the enforced `frame-ancestors 'none'` and the report-only policy.
- A team host: `https://<team>.<root>/api/tenant/manifest.webmanifest` names the team (the team needs its slug, set in the console).
- The MCP: `curl -s https://<app host>/.well-known/oauth-protected-resource/mcp` returns JSON (with `MCP_PUBLIC_URL` set: `https://mcp.<root>/.well-known/oauth-protected-resource/mcp`, and the app host answers 404).
- Forwarded headers: `curl -s -H 'X-Forwarded-For: 1.2.3.4' -H 'X-Real-IP: 1.2.3.4' https://<app host>/api/auth/ok`, then read the backend's log line for that request: the address is yours, not `1.2.3.4`. An OpenAPI key restricted to another address still gets 403 with a forged header. If the address shown is Traefik's or the CDN's, fix Traefik's `forwardedHeaders` (One-time setup, 8) before launch.
- API headers: `curl -sI https://<app host>/api/auth/ok | grep -i 'x-content-type-options\|x-frame-options'` prints each once.
- `curl -s https://<app host>/robots.txt` disallows `/api/`; the console's `robots.txt` disallows everything.

## Updating and rolling back

Push to the deploy branch.
- Compose mode: redeploy the app.
- Application mode: each Application whose watch paths match rebuilds and rolls over.

The new backend migrates while the old one still serves. That is safe because migrations only add: one per pull request, and a drop comes a release after the code stops reading the column (`apps/backend/AGENTS.md`, ADR-B01).

**Rollback:**
- Application mode: the Application → Deployments → redeploy the previous one.
- Compose mode: redeploy the previous commit.

The previous backend runs against the current schema, because changes are additive.

## Backups

- **Postgres:** a nightly dump off the server at least (`docker exec <postgres> pg_dump -U <user> <db> | gzip > …`). A managed cluster's point-in-time recovery is better.
- **Redis:** holds rate limits and short-lived state only, so it needs no backup.
- **Object storage:** copy the bucket nightly to a second bucket or provider (`rclone sync`).

Rehearse a restore before launch.

Besides the app's own data, the database holds tables a restore must not drop: `operator_audit_log` (who did what in the console), `storage_object_deletions` (bucket objects still to delete after an account purge), `erased_device_keys` (devices told to wipe their local copy) and the OAuth tables of connected apps. A restore to an older point can bring back an account that was purged since: purge it again from the console.

## After the first deploy of a release that encrypts provider tokens

Google and Apple tokens are stored encrypted from the backend release that includes this change on. Rows written before stay readable but plain until you run, once per environment (production, staging), from a shell with the environment's variables and the repository checked out (the runtime image ships no TypeScript sources):

```bash
yarn workspace @connected-repo/backend auth:encrypt-tokens
```

It is safe to run again: rows already encrypted are skipped.

## Team API keys

An operator issues a team API key for the API product. A key that may create journal entries writes them as one team member, chosen by the operator: after creating the key, set `writes_as_team_member_id` to that member's `team_members.id` (the member must belong to the key's team):

```sql
UPDATE teams_api SET writes_as_team_member_id = '<team_members.id>' WHERE team_api_id = '<key id>';
```

Without it the key's journal create requests are refused.

## Account deletion

A person asks to delete their account from their profile; it is removed after the grace period by a daily purge cron inside the backend. Operators act from the console's **Users** page, column **Deletion**: **Keep** or **Delete now**, each with a reason, each written to the operator audit trail. The full procedure, including the objects removed from the bucket, is in `docs/runbooks/account-deletion.md`.

## Hardening you may want

**A separate migration role.** The backend's entrypoint runs `node dist/db/db_script.js up` as the same `DB_USER` that serves requests, so that role owns the schema and can `DROP` anything. A stricter setup creates two roles: an owner role that runs migrations (`CREATE`, `ALTER`, `DROP` on the schema) and a runtime role with `SELECT, INSERT, UPDATE, DELETE` on the app's tables and `USAGE` on its sequences (plus `ALTER DEFAULT PRIVILEGES … GRANT … TO <runtime role>` so new tables are covered). The template has no split today: doing it means running migrations as a one-off job with the owner role's credentials before the backend starts (or teaching the entrypoint to use a second pair of variables), and giving the backend only the runtime role. pg-tbus creates its own tables at start (schema `tbus`), so the runtime role also needs `CREATE` there, or the owner role must create them first.

**Retention.** `api_product_request_logs` keeps every API request body, expired and signed-out `sessions` rows stay, and pg-tbus keeps finished task rows (`keepInSeconds` per task bounds some of them). Decide how long each is kept (for example: request logs 90 days, sessions 30 days after expiry, finished tasks 30 days) and add a daily cron with an advisory lock that deletes older rows, like the existing crons in `apps/backend/src/cron_jobs/`. Request logs hold whatever the API's callers sent, so the window is also a privacy decision.
