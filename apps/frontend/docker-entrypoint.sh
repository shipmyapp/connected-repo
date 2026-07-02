#!/bin/sh
# Rendered into /docker-entrypoint.d/, so nginx:alpine's stock entrypoint picks
# it up before starting nginx. The base image already runs envsubst on files in
# /etc/nginx/templates/*.template — we just guarantee BACKEND_UPSTREAM has a
# sensible default so the container never boots pointing at nothing.
set -e

: "${BACKEND_UPSTREAM:=backend:3000}"
export BACKEND_UPSTREAM

echo "[entrypoint] BACKEND_UPSTREAM=${BACKEND_UPSTREAM}"
