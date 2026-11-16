# syntax=docker/dockerfile:1
# The Node major version of every Node stage (the runtime too). One line per
# Dockerfile; keep it equal to engines.node in package.json and to CI.
ARG NODE_VERSION=26
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
# node:26 images ship neither Yarn nor Corepack; install the Yarn the lockfile is written for.
RUN npm install -g --no-fund --no-audit yarn@1.22.22
# git reads the short commit for the Sentry releases; the slim image has none.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN yarn global add turbo@2.11.11
COPY . .
# Empty when .git is absent; the releases then fall back to the package version.
RUN git -C /app rev-parse --short=7 HEAD > /app/.build-sha 2>/dev/null || : > /app/.build-sha
RUN turbo prune @connected-repo/backend @connected-repo/frontend @connected-repo/superadmin --docker

FROM base AS deps
WORKDIR /app
# node:26 images ship neither Yarn nor Corepack; install the Yarn the lockfile is written for.
RUN npm install -g --no-fund --no-audit yarn@1.22.22
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

# Build the console on the shared install. The backend's source is there for
# its types: the console imports the super-admin router's type.
FROM deps AS builder
COPY --from=manifests /app/out/full/ .

# The console's only build-time key. Empty: it calls its own origin, which the
# nginx below proxies to the backend.
ARG VITE_USER_NODE_ENV=production
ARG VITE_API_URL=""
ENV VITE_USER_NODE_ENV=$VITE_USER_NODE_ENV \
    VITE_API_URL=$VITE_API_URL

# Blank build args are "not set" (see apps/frontend/Dockerfile).
RUN --mount=type=cache,target=/app/node_modules/.cache/turbo \
    for v in $(env | sed -n 's/^\(VITE_[A-Z0-9_]*\)=$/\1/p'); do unset "$v"; done && \
    npx turbo run build --filter=@connected-repo/superadmin

# The image that ships: nginx serving the console and proxying to the backend.
FROM nginx:1.27-alpine AS runner
RUN apk add --no-cache curl
COPY --from=builder /app/apps/superadmin/dist /usr/share/nginx/html
COPY apps/superadmin/nginx.conf.template /etc/nginx/templates/default.conf.template
# 05-*.envsh: sourced before envsubst (20-), so its export survives.
COPY apps/superadmin/docker-entrypoint.envsh /docker-entrypoint.d/05-render-nginx-conf.envsh
RUN chmod +x /docker-entrypoint.d/05-render-nginx-conf.envsh
# Compose sets the backend's network alias; a Dokploy Application sets the
# backend's App Name (deploy/dokploy/superadmin.env).
ENV BACKEND_UPSTREAM=backend:3000
# Build-time smoke test of the rendered config (see apps/frontend/Dockerfile).
RUN BACKEND_UPSTREAM='127.0.0.1:3000' /docker-entrypoint.sh nginx -t
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1
