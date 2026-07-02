#!/bin/sh
# Rendered into /docker-entrypoint.d/, so nginx:alpine's stock entrypoint picks
# it up before starting nginx. The base image already runs envsubst on files in
# /etc/nginx/templates/*.template — we just guarantee the variables it needs
# have sensible defaults so the container never boots pointing at nothing.
set -e

: "${BACKEND_UPSTREAM:=backend:3000}"
export BACKEND_UPSTREAM

echo "[entrypoint] BACKEND_UPSTREAM=${BACKEND_UPSTREAM}"

# ── Sentry envelope tunnel ────────────────────────────────────────────────
# Derive the ingest upstream from SENTRY_DSN so nginx can proxy
# /api/sentry-tunnel directly to Sentry (bypasses ad-blockers).
#
# DSN format: https://<publicKey>@<host>/<projectId>
# Ingest URL: https://<host>/api/<projectId>/envelope/
#
# When SENTRY_DSN is unset, we set discard sentinels so envsubst produces a
# syntactically-valid nginx conf. Requests to the tunnel path get 502'd on
# connection refused (127.0.0.1:9 = discard protocol) rather than crashing
# nginx at boot. The frontend probe won't route to the tunnel unless Sentry
# ingest is blocked, so this is only hit in edge cases.
if [ -n "${SENTRY_DSN:-}" ]; then
    dsn_no_scheme="${SENTRY_DSN#https://}"
    dsn_no_scheme="${dsn_no_scheme#http://}"
    dsn_after_at="${dsn_no_scheme#*@}"
    SENTRY_INGEST_HOST="${dsn_after_at%%/*}"
    SENTRY_PROJECT_ID="${dsn_after_at##*/}"
    SENTRY_INGEST_URL="https://${SENTRY_INGEST_HOST}/api/${SENTRY_PROJECT_ID}/envelope/"
else
    SENTRY_INGEST_HOST="127.0.0.1"
    SENTRY_INGEST_URL="http://127.0.0.1:9/"
fi
export SENTRY_INGEST_HOST SENTRY_INGEST_URL

echo "[entrypoint] SENTRY_INGEST_URL=${SENTRY_INGEST_URL}"
