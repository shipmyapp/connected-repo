# Superadmin Console (AGENTS.md)

## 1. Blueprint
**Intent**: The operator console, its own deployable on a sibling subdomain of the app (e.g. `admin.<root>`; its label must be one of `RESERVED_TENANT_SLUGS`, or it would be read as a team host). Teams (with members), users, feature flags and the audit trail.
**Core Stack**: React 19, Vite 7, React Router 7 (data router), TanStack Query + `@orpc/tanstack-query`, MUI via `@connected-repo/ui-mui`, Better Auth client. No PWA, no service worker, no Sentry, no offline data.

**Key Architectures**:
- **One router, typed from the backend**: `utils/orpc.client.ts` → `${origin}/api/super-admin` (`credentials: "include"`, CSRF link plugin), typed by `@backend/routers/super_admin/super_admin.router`. Never the user app's router.
- **Sign-in**: the app's Better Auth (`/api/auth/*`, Google). `utils/admin.loader.ts` runs `ping`: signed out → `/login`, refused → `/denied`. The allowlist (`SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_PHONE_NUMBERS`, verified addresses only) is enforced by `rpcSuperAdminProcedure` on every call; the console only decides what to show.
- **Same origin**: `/api/*` is proxied to the backend (Vite in dev, nginx in production). Dev on http://localhost:5175 (`strictPort`; 5174 is the frontend's Playwright preview); the origin must be in the backend's `ALLOWED_ORIGINS`. In production `PROD_COOKIE_DOMAIN=.<root>` is required (Google's callback lands on the app's host), so a console sign-in is also an app sign-in.
- **Budget**: 30 calls a minute per operator: queries stale for 30 s, no refetch on focus, never retry a 401/403 (`utils/query_client.ts`).
- **Shared pieces**: every component or helper the frontend could also use comes from `@connected-repo/ui-mui` (`ConfirmDialog`, `When`, `QueryState`, `PageHeader`, `DataTable`, `ErrorScreen`, `AppErrorBoundary`, `AppToastContainer`, `utils/rpc_errors`, `utils/api_origin`). Never copy one into `src/`, and never import from `apps/frontend`.

## 2. Pages
| Route | Page |
|---|---|
| `/login` | Google sign-in |
| `/denied` | Signed in but not on the allowlist |
| `/teams` | All teams, newest first, server search by name; owner, members, created |
| `/teams/:teamId` | The team and its members (invited-but-not-signed-up shown as "Invited"); the private app subdomain (`SubdomainCard` → `assignTeamSlug`, audited; moving or withdrawing one asks first) |
| `/users` | All accounts, newest first, server search by name or email; "Sign out everywhere" per account (confirmed, with a reason) |
| `/flags` | Feature flags: global and per-team rows, toggle, delete (confirmed) |
| `/audit` | Every console change, newest first: who, action, target, before → after, reason, IP |

## 3. Decision Records
| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-A01] | Same sign-in, shared cookie | Accepted | Google through the app's Better Auth; the OAuth callback is on the app's host, so production shares the session via `PROD_COOKIE_DOMAIN`. |
| [ADR-A02] | One proxy prefix | Accepted | The console's RPC lives under `/api/super-admin`, so its proxy forwards `/api/*` only. |
| [ADR-A03] | ui-mui's peers are listed here | Accepted | `dayjs`, `material-react-table`, `react-toastify` are dependencies of this app although it reaches them through ui-mui: a pruned image installs this app's dependencies. |
| [ADR-A04] | Every destructive act is confirmed | Accepted | Deletes and sign-outs go through `ConfirmDialog`; failures show `describeError`'s sentence. |
| [ADR-A05] | Every change is on record | Accepted | Each super-admin mutation is written as `withOperatorAudit(context, { action, targetKind, targetId, reason?, before, apply })` on the backend; the Audit page lists the trail. A new console action without it is not finished. |

## 4. Commands
- `yarn workspace @connected-repo/superadmin dev | build | check-types | lint`
