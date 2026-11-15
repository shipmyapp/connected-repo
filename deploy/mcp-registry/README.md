# The official MCP Registry entry

Fill in every `example.com` / `<github-user>` placeholder before publishing; the template ships it unpublished.

`server.json` here is this app's entry in the official MCP Registry (`registry.modelcontextprotocol.io`): a remote server only, Streamable HTTP at `https://mcp.example.com/mcp`, no package. The registry stores no OAuth facts; clients find the sign-in through the server's own discovery documents (RFC 9728 and RFC 8414), as they do today. PulseMCP and other directories pick entries up from here.

The entry is published by hand, by the owner, from a machine with `mcp-publisher` (ADR-045). Nothing here runs in CI.

## Which name

The registry ties a name's namespace to how the publisher logged in:

| Name | Login | What it needs |
|---|---|---|
| `io.github.<github-user>/oneq` (the file as committed) | `mcp-publisher login github` | The GitHub account `<github-user>`, through a device code in the browser. Nothing else. |
| `com.example/oneq` | `mcp-publisher login dns` or `login http` | Proving `example.com`: one TXT record on the apex domain, or one file at `https://example.com/.well-known/mcp-registry-auth`. The name then reads as the company's. |

Start with the GitHub name (no DNS wait); the domain name can be published later as a second entry, or the first deprecated with `mcp-publisher status`.

## Steps

1. Install the publisher (macOS: `brew install mcp-publisher`; otherwise the release tarball):
   ```bash
   curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
   ```
2. Check the file:
   ```bash
   cd deploy/mcp-registry
   mcp-publisher validate server.json
   ```
3. Log in. For the GitHub name:
   ```bash
   mcp-publisher login github
   ```
   For the domain name, generate a key once, keep `key.pem` out of the repository, and publish the public half:
   ```bash
   openssl genpkey -algorithm Ed25519 -out key.pem
   PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
   echo "example.com. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
   ```
   Add that TXT record to `example.com` (the apex, not a subdomain; through Cloudflare it is a plain TXT, not proxied), or serve the value `v=MCPv1; k=ed25519; p=<PUBLIC_KEY>` as plain text at `https://example.com/.well-known/mcp-registry-auth`. Then:
   ```bash
   PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
   mcp-publisher login dns --domain example.com --private-key "${PRIVATE_KEY}"
   # or: mcp-publisher login http --domain example.com --private-key "${PRIVATE_KEY}"
   ```
   and change `name` in `server.json` to `com.example/oneq` before publishing.
4. Publish:
   ```bash
   mcp-publisher publish server.json
   ```
5. See it: `https://registry.modelcontextprotocol.io/v0/servers?search=oneq`.

## Later

- A change to the description, the icons or the URL is a new `version` (bump it, validate, publish again; versions are not overwritten).
- Taking it down: `mcp-publisher status --status deprecated --message "…" io.github.<github-user>/oneq` (or `deleted`).
- The registry checks the file's shape, not the endpoint, so it stays listed through an outage; the server must simply be reachable at the URL. Keep the `connected_apps.enabled` flag in mind: with it off, `/mcp` answers 404 while the entry stays up.
- The description is capped at 100 characters, `name` must be `namespace/name` with letters, digits, dots, hyphens and underscores, and icon links must be `https`.
