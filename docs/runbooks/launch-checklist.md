# Launch checklist

Work top to bottom. The deploy steps themselves are in [deploy/README.md](../../deploy/README.md).

## 1. Accounts and keys (before the first deploy)

| Item | Where | Notes |
| --- | --- | --- |
| PostgreSQL 18, backups on | bundled, Dokploy or managed | `DB_*`, `DB_SSL*` |
| Redis 7 | bundled, Dokploy or managed | `REDIS_URL` (required) |
| Object storage bucket, scoped key, CORS for PUT, public read without listing | your provider | `S3_*`, `CSP_CONNECT_EXTRA` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` | never reuse between environments |
| Google OAuth client (web; iOS/Android client ids for the mobile app) | Google Cloud | `GOOGLE_*` |
| Sign in with Apple (optional) | Apple Developer | `APPLE_*` |
| Novu secret key, API URL, app identifier | Novu | optional: blank turns notifications off |
| Firebase web config and service account | Firebase console | optional: blank turns push and silent sync off |
| Sentry DSNs, org, project, auth token | Sentry | optional; [sentry.md](./sentry.md) |
| DNS for the app, the console and `*.<root>`; the DNS-challenge resolver | DNS provider, Dokploy's Traefik | the wildcard certificate for team hosts |
| Super-admin allowlist | `SUPER_ADMIN_EMAILS` | |

## 2. Deploy

1. Fill in `deploy/prod.env.example`.
2. Compose mode or Application mode, as [deploy/README.md](../../deploy/README.md) says.

## 3. Smoke test (on the live hosts)

1. `https://<app host>/healthz` and `https://<console host>/healthz` answer `ok`.
2. Sign in with Google (and Apple, if configured).
3. Create a journal entry with an attachment; reload offline (DevTools → Offline): the entry and its attachment are still there; back online, a second device sees it after sync.
4. Turn on notifications; a reminder arrives as a push.
5. Console host: sign in with an allowlisted account; the console loads.
6. A team with a slug: its host shows the team's name and icon, and installs as its own app.
7. Connect an AI app to `https://<app host>/mcp` (or `https://mcp.<root>/mcp`): it signs in through OAuth and lists journal entries.
8. `curl -sI https://<app host>/` shows the security headers, and the forwarded-header check of [deploy/README.md](../../deploy/README.md) ("Checking a deployment") shows your own address.

## 4. Before calling it live

- Backups: one restore rehearsed, with the time it took.
- Sentry: the first release shows up with source maps; CSP reports reviewed, and a date set to enforce the policy (`CSP_ENFORCE=true`).
- `docs/legal` reviewed, published at `VITE_TERMS_URL` and `VITE_PRIVACY_URL`, and `LEGAL_VERSION` set to the published version.
