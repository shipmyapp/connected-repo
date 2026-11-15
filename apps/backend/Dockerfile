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
RUN yarn global add turbo@2.8.12
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

# Build the backend on the shared install (`yarn build` checks the Novu
# templates with tsx first, then compiles).
FROM deps AS builder
COPY --from=manifests /app/out/full/ .
RUN --mount=type=cache,target=/app/node_modules/.cache/turbo \
    npx turbo run build --filter=@connected-repo/backend

# The backend's own package list, for the production install the runtime
# image ships (the shared install above carries every app's dev tools).
FROM manifests AS backend-manifests
RUN turbo prune @connected-repo/backend --docker --out-dir /app/out-backend

# Production packages only, from the same shared Yarn cache: anything the
# shared install fetched is reused, nothing is downloaded twice.
FROM base AS installer
WORKDIR /app
# node:26 images ship neither Yarn nor Corepack; install the Yarn the lockfile is written for.
RUN npm install -g --no-fund --no-audit yarn@1.22.22
COPY --from=backend-manifests /app/out-backend/json/ .
COPY --from=backend-manifests /app/out-backend/yarn.lock ./yarn.lock
RUN --mount=type=cache,id=yarn-monorepo,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --production=true --network-timeout 600000
# Yarn puts a package it cannot hoist (two versions in the tree) in the
# workspace's own node_modules; the runtime needs that folder too. Created
# when Yarn made none, so the COPY below always has a source.
RUN mkdir -p apps/backend/node_modules

# The image that ships. The last stage, so a Dokploy Application needs no
# build stage and compose no target.
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

# Don't run production as root.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Production dependencies (hoisted, and the backend's own unhoisted ones), and
# the workspace packages' package.json files.
COPY --from=installer --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=nodejs:nodejs /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=installer --chown=nodejs:nodejs /app/packages ./packages

# The built backend.
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/package.json ./apps/backend/package.json
# The commit this image was built from: the Sentry release (src/otel.sdk.ts).
COPY --from=manifests --chown=nodejs:nodejs /app/.build-sha ./apps/backend/.build-sha

# Built output of every workspace package the backend imports
# (apps/backend/package.json); the installer stage has only their package.json.
COPY --from=builder --chown=nodejs:nodejs /app/packages/zod-schemas/dist ./packages/zod-schemas/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/typescript-config ./packages/typescript-config

COPY --chown=nodejs:nodejs apps/backend/scripts/docker-entrypoint.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Declaration files in the migrations directory would be read as migrations.
RUN find ./apps/backend/dist/db/migrations -type f \( -name "*.d.ts" -o -name "*.d.ts.map" \) -delete
# curl for the healthcheck.
RUN apk add --no-cache curl
# The smoke test below writes and removes apps/backend/.env as nodejs.
RUN chown nodejs:nodejs /app/apps/backend
USER nodejs

ENV NODE_ENV=production
ENV TZ=Etc/UTC
# Graceful shutdown (src/utils/graceful_shutdown.utils.ts): HTTP drain, then
# in-flight pg-tbus tasks; the process force-exits after AGENT_TASK_TIMEOUT + 10 s.
# Give the container that long to stop (docker-compose.prod.yml: stop_grace_period 310s).
ENV GRACEFUL_SHUTDOWN_TIMEOUT=30000
ENV AGENT_TASK_TIMEOUT=300000

WORKDIR /app/apps/backend

# Smoke-test the image that ships, not a build stage: check the env schema,
# then boot the server with --smoke-test (it exits once listening), so a file
# this stage forgot to copy (a workspace package's dist, say) fails the build
# instead of crash-looping on deploy. The values are the committed
# apps/backend/.env.example, so the example must always satisfy the schema; it
# is bind-mounted, never stored in a layer, and the copy is removed in the same
# step. NODE_ENV=production (the stage's ENV, which dotenv does not override)
# runs the production rules; the boot check that refuses the example's
# BETTER_AUTH_SECRET skips a --smoke-test boot. No Postgres or Redis is
# reachable here: neither is needed to listen.
RUN --mount=type=bind,from=builder,source=/app/apps/backend/.env.example,target=/tmp/backend.env.example \
    cp /tmp/backend.env.example .env && \
    node dist/configs/env.config.js && \
    node dist/server.js --smoke-test && \
    rm .env

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD response=$(curl -fsS http://localhost:3000/) && \
      echo "$response" && \
      echo "$response" | grep -q '"status":"ok"' || exit 1

STOPSIGNAL SIGTERM

# Applies migrations (node dist/db/db_script.js up), then execs the server.
# Safe under Swarm start-first because migrations only add.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
