# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# Stage 1: Prepare - Prune the monorepo to include frontend AND backend.
# Backend is included because the frontend imports oRPC router *types* via a
# cross-app relative path (../../../backend/src/routers/user_app/user_app.router).
# Without backend in the pruned tree, TypeScript can't resolve those types and
# the build fails with a cascade of `unknown` errors.
FROM base AS prepare
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
# git captures the short commit SHA below for Sentry release tagging.
# node:22-slim doesn't ship with it. Once Dokploy PR #4007 lands (exposing
# DOKPLOY_COMMIT_SHORT as a build arg), we can drop this install + the SHA
# capture and pass VITE_SENTRY_RELEASE=$DOKPLOY_COMMIT_SHORT via Build-time
# Arguments instead.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN yarn global add turbo
COPY . .
# Capture the short commit SHA. Falls back to "nogit" so the build never fails
# on this alone (e.g. tar-based builds where .git isn't present).
RUN git -C /app rev-parse --short=7 HEAD > /app/.build-sha 2>/dev/null || echo "nogit" > /app/.build-sha
RUN turbo prune @connected-repo/frontend @connected-repo/backend --docker

# Stage 2: Builder - Install dependencies and build
FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/yarn.lock ./yarn.lock
COPY --from=prepare /app/.build-sha /app/.build-sha

RUN --mount=type=cache,target=/root/.yarn \
    yarn install --frozen-lockfile --production=false

COPY --from=prepare /app/out/full/ .

# Build-time Vite env — Vite inlines these at build. Passed from docker-compose
# build.args, sourced from Dokploy env vars. Empty VITE_API_URL means the client
# uses relative paths (same-origin), which is what the nginx reverse proxy expects.
ARG VITE_USER_NODE_ENV=production
ARG VITE_API_URL=""
ARG VITE_USER_APP_URL=""
ARG VITE_OTEL_SERVICE_NAME=frontend
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_ENV=""
ARG VITE_SENTRY_RELEASE=""
ARG VITE_SENTRY_ORG=""
ARG VITE_SENTRY_PROJECT=""
# VITE_SENTRY_AUTH_TOKEN is a real build-time secret — supplied via BuildKit
# `--mount=type=secret` on the build RUN below (never as an ARG, so it doesn't
# leak into image layer history). It uploads sourcemaps to Sentry; it is NOT
# inlined into the JS bundle.
ARG VITE_NOVU_APP_IDENTIFIER=""
ARG VITE_NOVU_API_URL=""
ARG VITE_NOVU_SOCKET_URL=""
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_FIREBASE_VAPID_KEY=""

ENV VITE_USER_NODE_ENV=$VITE_USER_NODE_ENV \
    VITE_API_URL=$VITE_API_URL \
    VITE_USER_APP_URL=$VITE_USER_APP_URL \
    VITE_OTEL_SERVICE_NAME=$VITE_OTEL_SERVICE_NAME \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENV=$VITE_SENTRY_ENV \
    VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE \
    VITE_SENTRY_ORG=$VITE_SENTRY_ORG \
    VITE_SENTRY_PROJECT=$VITE_SENTRY_PROJECT \
    VITE_NOVU_APP_IDENTIFIER=$VITE_NOVU_APP_IDENTIFIER \
    VITE_NOVU_API_URL=$VITE_NOVU_API_URL \
    VITE_NOVU_SOCKET_URL=$VITE_NOVU_SOCKET_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY

RUN --mount=type=cache,target=/app/node_modules/.cache/turbo \
    --mount=type=secret,id=VITE_SENTRY_AUTH_TOKEN \
    export VITE_SENTRY_AUTH_TOKEN="$(cat /run/secrets/VITE_SENTRY_AUTH_TOKEN 2>/dev/null || true)" && \
    export VITE_SENTRY_RELEASE="$(cat /app/.build-sha)" && \
    export SENTRY_UPLOAD_SOURCEMAPS=1 && \
    npx turbo run build --filter=@connected-repo/frontend

# Stage 3: Runner - nginx serving static bundle + reverse proxy to backend
FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
# Must run BEFORE the base image's 20-envsubst-on-templates.sh — this script
# derives SENTRY_INGEST_URL from SENTRY_DSN and exports it, so envsubst has
# the variable available when it renders the template. Named 05- to sort
# before any nginx-provided entrypoint (which all start at 10-).
COPY apps/frontend/docker-entrypoint.sh /docker-entrypoint.d/05-render-nginx-conf.sh
RUN chmod +x /docker-entrypoint.d/05-render-nginx-conf.sh

# Reverse-proxy target. Overridden by docker-compose to point at the internal
# backend service (e.g. "backend:3000") on the shared Docker network.
ENV BACKEND_UPSTREAM=backend:3000

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1
