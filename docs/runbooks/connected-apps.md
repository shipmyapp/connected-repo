# Connected apps (the application MCP)

People connect their own AI apps (Claude, ChatGPT, Claude Code, Cursor, VS Code…) to their account and work through them (ADR-045). This page is for publishing the server, connecting a client and looking after it.

## Where it lives

| Host | Path | What |
|---|---|---|
| MCP origin | `POST /mcp` | The MCP server (Streamable HTTP, stateless, JSON responses). Bearer token only, CORS `*`. |
| MCP origin | `GET /.well-known/oauth-protected-resource/mcp` | Where to sign in (RFC 9728): names `<VITE_API_URL>/api/auth` as the authorization server. |
| both | `GET /.well-known/oauth-authorization-server/api/auth` | The OAuth server's metadata (RFC 8414) + `client_id_metadata_document_supported`. |
| App origin | `POST /api/auth/oauth2/register` | Open registration (RFC 7591), public or confidential, PKCE forced, redirect URIs `https:` or loopback `http:` with a port (no fragment, no userinfo), 10/min per IP and 500/day in total, at most `MAX_OAUTH_CLIENTS` apps (`oauth_registration.handler.ts`). |
| App origin | `/api/auth/oauth2/{authorize,consent,token,revoke}` | Better Auth's OAuth provider. |
| App origin | `/oauth/consent` | The consent screen. |

The MCP origin is `MCP_PUBLIC_URL` when set, else the API origin (`VITE_API_URL`). With `MCP_PUBLIC_URL` set, the MCP host serves only `/`, `/mcp` and the two discovery documents (everything else 404), and the app host answers 404 for `/mcp` and the protected-resource document.

### Own host (optional)

Use `mcp.<root>` (`<root>` is `TENANT_ROOT_DOMAIN`; `mcp` is a reserved team slug), so the team-host route and wildcard certificate already cover it (`deploy/README.md`).

1. DNS: `*.<root>` already points at the server; nothing to add.
2. The frontend nginx passes every request for that host to the backend, keeping the `Host` header (the backend tells the MCP host apart by it). It learns the host from `MCP_PUBLIC_URL` in its own runtime environment.
3. Set `MCP_PUBLIC_URL=https://mcp.example.com` for the backend and the frontend (one shared value in both deploy modes); restart both.
4. Check: `curl -s https://mcp.example.com/.well-known/oauth-protected-resource/mcp` names `https://mcp.example.com/mcp`; `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://mcp.example.com/mcp` prints `401`.

Nothing else goes in the environment: the issuer comes from `VITE_API_URL`, the consent page from `WEBAPP_URL`, signatures from `BETTER_AUTH_SECRET`. `ALLOWED_ORIGINS` must contain the origin of `VITE_API_URL` (the sign-in resumes at the authorize URL).

## Team hosts

There is one issuer, the API's `/api/auth` (`VITE_API_URL`), and the consent screen lives on the shared app host (`WEBAPP_URL`). A team host (`<slug>.<root>`) is not a second issuer: its people connect an AI app through the shared host, and one connection covers every team the person belongs to (tools take a `teamId`).

## Connecting an app

- **Claude** (claude.ai, Desktop): Settings → Connectors → Add custom connector → `<MCP origin>/mcp`. Either OAuth choice works: Claude's published identity (a Client ID Metadata Document) or automatic registration (confidential client).
- **ChatGPT**: developer mode → add a connector with the address and OAuth.
- **Claude Code**: `claude mcp add --transport http oneq <MCP origin>/mcp`, then `/mcp` to sign in.
- **Cursor / VS Code**: add an HTTP MCP server with the address.

The person signs in with Google or Apple (the authorize request is the sign-in's return address), then chooses on the consent screen whether the app may add journal entries. Reading is part of every connection.

## What an app can do

Tools (`modules/user_mcp/tools/*`): `whoami`, `list_teams`, `list_team_members`, `list_journal_entries`, `get_journal_entry`, `list_prompts` (scope `read`); `create_journal_entry` (scope `write`, preview first, then the same call with `entryId` + `confirmation`). Team-scoped tools take `teamId`; without it they use the team open in the app, and they never change it.

### Adding a tool

1. Make sure a user-app procedure does the work; add it to `connectedAppRouter` in `services/app_client.user_mcp.service.ts` (never call `db` for a write from a tool).
2. `defineTool(server, ctx, { name, title, description, scope, kind, input, run })` in a `tools/*.tools.user_mcp.ts` file, registered in `user_mcp.server.ts`. Team-scoped: `teamForCall(ctx.principal, args.teamId)` then `ctx.app(team.teamId)`.
3. A write: preview + `confirmationFor`/`isConfirmationValid` (see `create_journal_entry`), return `action` so it is recorded.
4. A test in `user_mcp.test.ts` through a real MCP client.

### Extension points (not in the template)

Larger products add these; build them when a product needs them: an MCP Apps upload view (`@modelcontextprotocol/ext-apps`, a `ui://<app>/upload.html` resource) with signed one-use upload slots on `/mcp/upload/<slot>`; adding files from a URL through `fetch_remote.user_mcp.service.ts`; server-side content rules for text that other people read; MCP prompts (`server.registerPrompt`); icons served from the MCP host.

## Looking after it

- **Switch it off**: a global feature flag `connected_apps.enabled = false` (feature_flags table, default on). `/mcp` answers 404 within 5 s; discovery stays up.
- **Rate**: `mcp:user:<id>` 120 calls/min; procedures' own `app:user:<id>` (300/min, shared with the person's devices) applies too; `mcp:bad-token:ip:<ip>` 20/min; `oauth-register:ip:<ip>` 10/min and `oauth-register:all` 500/day; `cimd:<client_id>` 6/hour, `cimd:ip:<ip>` 20/hour and `cimd:all` 300/hour. All fail open. Every `<ip>` is the address the server stamped (`TRUSTED_PROXY_COUNT`).
- **Registered apps**: at most `MAX_OAUTH_CLIENTS` (5000); past it registration answers 503 and new metadata documents are refused. The daily cron `oauth_clients_cleanup.cron.ts` removes apps older than a week that nobody connected (no consent, no token).
- **A person's apps**: Profile → Connected apps (disconnect deletes the consent and every token; taking `write` away applies to tokens already issued).
- **An app gone bad**: `UPDATE oauth_clients SET disabled = true WHERE client_id = '…';` — every token it holds stops on the next call.
- **Logs**: one line per tool call, `application MCP call` / `application MCP call refused`, with tool, person, app and duration; registrations log `connected app registered`.
- **Audit**: `connected_app_actions` (one row per change: tool, what, the person's request, entity).
- **Known limit**: Better Auth's token endpoint keeps the app's CORS (`ALLOWED_ORIGINS`); MCP clients that exchange tokens from a browser page on another origin are not supported. Server-side clients (Claude, ChatGPT, desktop and CLI apps) are unaffected.
