# syntax=docker/dockerfile:1
# The Node major version of every Node stage (the runtime too). One line per
# Dockerfile; keep it equal to engines.node in package.json and to CI.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# ── The shared install. Keep these two stages identical, line for line, in
# apps/backend/Dockerfile, apps/frontend/Dockerfile and apps/superadmin/Dockerfile.
# Every app installs the whole monorepo from one lockfile into one Yarn cache,
# so the build server holds one copy of the dependencies, reused by all three
# builds, not one per app. BuildKit keys the install by the package.json files
# and the lockfile: a build after the first one, or a deploy that changes no
# dependency, does not install again. turbo is pinned to the version in yarn.lock.
FROM base AS manifests
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
# git reads the short commit for the Sentry releases; the slim image has none.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN yarn global add turbo@2.8.12
COPY . .
# Empty when .git is absent; the releases then fall back to the package version.
RUN git -C /app rev-parse --short=7 HEAD > /app/.build-sha 2>/dev/null || : > /app/.build-sha
RUN turbo prune @connected-repo/backend @connected-repo/frontend @connected-repo/superadmin --docker

FROM base AS deps
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY --from=manifests /app/out/json/ .
COPY --from=manifests /app/out/yarn.lock ./yarn.lock
# Yarn 1's cache is /usr/local/share/.cache/yarn (`yarn cache dir` as root). One id
# for every app, locked so two installs never write it at once; identical
# installs running together are one step to BuildKit, so the lock rarely waits.
# The long network timeout lets a slow registry finish instead of failing the
# deploy, and what already downloaded stays in the cache for a retry.
RUN --mount=type=cache,id=yarn-monorepo,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --production=false --network-timeout 600000
# ── End of the shared install.

# Build the frontend on the shared install. The backend's source is there too:
# the frontend imports the user app router's types
# (../../../backend/src/routers/user_app/user_app.router) and type-checks
# against them while it builds.
FROM deps AS builder
COPY --from=manifests /app/.build-sha /app/.build-sha
COPY --from=manifests /app/out/full/ .

# Build-time Vite env: Vite inlines these into the bundle, so they are public.
# Compose passes them as build args from its .env; a Dokploy Application passes
# its Build-time Arguments (deploy/dokploy/frontend.build-args). An empty
# VITE_API_URL means the app calls its own origin, which nginx below proxies.
ARG VITE_USER_NODE_ENV=production
ARG VITE_API_URL=""
# The shared app, for the "go to the shared app" link on team hosts.
ARG VITE_USER_APP_URL=""
# Team hosts `<slug>.<root>`; must equal the backend's TENANT_ROOT_DOMAIN.
# Empty = team hosts off.
ARG VITE_TENANT_ROOT_DOMAIN=""
# Published terms and privacy pages; both empty = no links, no agreement step.
ARG VITE_TERMS_URL=""
ARG VITE_PRIVACY_URL=""
# Names the Sentry release (`<this>@<commit>`) and traces; keep it stable.
ARG VITE_OTEL_SERVICE_NAME=connected-repo-frontend
ARG VITE_SENTRY_DSN=""
ARG VITE_SENTRY_ENV=""
ARG VITE_SENTRY_ORG=""
ARG VITE_SENTRY_PROJECT=""
# Sampling; empty keeps the code's defaults.
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=""
ARG VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=""
ARG VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=""
# VITE_SENTRY_AUTH_TOKEN is a build secret, mounted on the build RUN below
# (never an ARG, so it stays out of the image history). It uploads source maps
# to Sentry and is not inlined into the bundle.
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
    VITE_TENANT_ROOT_DOMAIN=$VITE_TENANT_ROOT_DOMAIN \
    VITE_TERMS_URL=$VITE_TERMS_URL \
    VITE_PRIVACY_URL=$VITE_PRIVACY_URL \
    VITE_OTEL_SERVICE_NAME=$VITE_OTEL_SERVICE_NAME \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENV=$VITE_SENTRY_ENV \
    VITE_SENTRY_ORG=$VITE_SENTRY_ORG \
    VITE_SENTRY_PROJECT=$VITE_SENTRY_PROJECT \
    VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE \
    VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=$VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE \
    VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=$VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE \
    VITE_NOVU_APP_IDENTIFIER=$VITE_NOVU_APP_IDENTIFIER \
    VITE_NOVU_API_URL=$VITE_NOVU_API_URL \
    VITE_NOVU_SOCKET_URL=$VITE_NOVU_SOCKET_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY

# The release is the commit (empty without .git: the package version). A blank
# build arg is "not set": an ARG nobody passed is an empty ENV, which Vite would
# hand to the schema instead of its default, so the empty ones are unset before
# the build (blank means unset, as in Dokploy's env editor).
RUN --mount=type=cache,target=/app/node_modules/.cache/turbo \
    --mount=type=secret,id=VITE_SENTRY_AUTH_TOKEN \
    export VITE_SENTRY_AUTH_TOKEN="$(cat /run/secrets/VITE_SENTRY_AUTH_TOKEN 2>/dev/null || true)" && \
    export VITE_SENTRY_RELEASE="$(cat /app/.build-sha)" && \
    export SENTRY_UPLOAD_SOURCEMAPS=1 && \
    for v in $(env | sed -n 's/^\(VITE_[A-Z0-9_]*\)=$/\1/p'); do unset "$v"; done && \
    npx turbo run build --filter=@connected-repo/frontend

# The image that ships: nginx serving the bundle and proxying to the backend.
FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
# Both rendered at start by the base image's envsubst step (20-) into
# /etc/nginx/conf.d/: default.conf, and security-headers.inc, which it includes.
COPY apps/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/frontend/nginx.security-headers.inc.template /etc/nginx/templates/security-headers.inc.template
# 05-*.envsh: SOURCED by the base entrypoint before envsubst (20-), so its
# exports reach the templates (.sh files there run in subshells; see the file).
COPY apps/frontend/docker-entrypoint.envsh /docker-entrypoint.d/05-render-nginx-conf.envsh
RUN chmod +x /docker-entrypoint.d/05-render-nginx-conf.envsh

# Reverse-proxy target. Compose sets the backend's network alias; a Dokploy
# Application sets the backend's App Name (deploy/dokploy/frontend.env).
ENV BACKEND_UPSTREAM=backend:3000

# Build-time smoke test: run the whole entrypoint pipeline, then `nginx -t` on
# the rendered config, so a template typo or a missing variable fails the
# build instead of crash-looping on deploy. 127.0.0.1 because nginx resolves
# upstreams while parsing and `backend` does not exist in the build sandbox.
# Realistic values run the Sentry tunnel, CSP-report and MCP-host derivations
# for real.
RUN SENTRY_DSN='https://public@o0.ingest.sentry.io/1' \
    BACKEND_UPSTREAM='127.0.0.1:3000' \
    CSP_CONNECT_EXTRA='https://s3.example.com' \
    MCP_PUBLIC_URL='https://mcp.example.com' \
    /docker-entrypoint.sh nginx -t

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1
