#!/bin/sh
# Copied into /docker-entrypoint.d/ as 05-render-nginx-conf.sh — the 05 prefix
# is load-bearing. The nginx:alpine base image runs envsubst on templates in
# script 20-, so any variable we want expanded MUST be exported here (< 20).
# See apps/frontend/Dockerfile for the COPY.
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
