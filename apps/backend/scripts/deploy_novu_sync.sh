#!/bin/sh
# Post-deploy hook to publish code-defined Novu workflows to the Novu control
# plane. Wire this into Dokploy's "Post-Deployment Script" field so it runs
# once per deploy, after the backend healthcheck goes green.
#
# It does NOT run inside the backend container. `novu sync` calls Novu's API,
# which then calls back to your public bridge URL to pull workflow defs — so
# this only needs shell + npx access to a public bridge URL.
#
# Required env:
#   NOVU_SECRET_KEY  — server-side secret from your Novu dashboard
#   NOVU_API_URL     — e.g. https://api.novu.co (or your self-hosted API)
#   NOVU_BRIDGE_URL  — public URL Novu will call to pull workflows
#                      (default: ${WEBAPP_URL}/api/novu)
#
# Exit codes:
#   0 = sync succeeded
#   1 = missing required env
#   * = novu CLI's own exit code
set -eu

: "${NOVU_SECRET_KEY:?NOVU_SECRET_KEY is required}"
: "${NOVU_API_URL:?NOVU_API_URL is required}"

BRIDGE_URL="${NOVU_BRIDGE_URL:-${WEBAPP_URL:-}/api/novu}"
case "$BRIDGE_URL" in
	/api/novu)
		echo "Set NOVU_BRIDGE_URL or WEBAPP_URL so we can build a public bridge URL." >&2
		exit 1
		;;
esac

echo "[novu-sync] bridge=${BRIDGE_URL} api=${NOVU_API_URL}"

# NOVU_SECRET_KEY is read from env by the CLI — don't pass on argv so it
# doesn't land in shell history or `ps` on shared hosts.
exec npx -y novu@latest sync \
	--bridge-url "$BRIDGE_URL" \
	--api-url "$NOVU_API_URL"
