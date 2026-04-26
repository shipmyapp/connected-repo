# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# Stage 1: Prepare - Prune the monorepo to only include backend and its dependencies
FROM base AS prepare
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn global add turbo
COPY . .
RUN turbo prune @connected-repo/backend --docker

# Stage 2: Builder - Install dependencies and build
FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/yarn.lock ./yarn.lock

RUN --mount=type=cache,target=/root/.yarn \
    yarn install --frozen-lockfile --production=false

COPY --from=prepare /app/out/full/ .

# Run build
RUN --mount=type=cache,target=/app/node_modules/.cache/turbo \
    npx turbo run build --filter=@connected-repo/backend

# Validate environment config (fails build if required env vars are missing/invalid)
# We use dummy values to satisfy the schema for the build-time check
RUN cd apps/backend && \
    PORT=3000 \
    VITE_API_URL=http://localhost:3000 \
    WEBAPP_URL=http://localhost:5173 \
    DB_HOST=localhost \
    DB_PORT=5432 \
    DB_USER=user \
    DB_PASSWORD=pass \
    DB_NAME=db \
    DB_SCHEMA=public \
    BETTER_AUTH_SECRET=12345678901234567890123456789012 \
    SESSION_SECRET=12345678901234567890123456789012 \
    CRON_JOB_TOKEN=12345678901234567890123456789012 \
    OTEL_SERVICE_NAME=backend \
    S3_ENDPOINT=http://localhost:9000 \
    S3_REGION=us-east-1 \
    S3_ACCESS_KEY_ID=key \
    S3_SECRET_ACCESS_KEY=secret \
    S3_BUCKET_NAME=bucket \
    GOOGLE_WEB_CLIENT_ID=123.apps.googleusercontent.com \
    GOOGLE_WEB_CLIENT_SECRET=secret \
    node dist/configs/env.config.js

# Smoke test server (fails build if server crashes on boot)
RUN cd apps/backend && \
    PORT=3000 \
    VITE_API_URL=http://localhost:3000 \
    WEBAPP_URL=http://localhost:5173 \
    DB_HOST=localhost \
    DB_PORT=5432 \
    DB_USER=user \
    DB_PASSWORD=pass \
    DB_NAME=db \
    DB_SCHEMA=public \
    BETTER_AUTH_SECRET=12345678901234567890123456789012 \
    SESSION_SECRET=12345678901234567890123456789012 \
    CRON_JOB_TOKEN=12345678901234567890123456789012 \
    OTEL_SERVICE_NAME=backend \
    S3_ENDPOINT=http://localhost:9000 \
    S3_REGION=us-east-1 \
    S3_ACCESS_KEY_ID=key \
    S3_SECRET_ACCESS_KEY=secret \
    S3_BUCKET_NAME=bucket \
    GOOGLE_WEB_CLIENT_ID=123.apps.googleusercontent.com \
    GOOGLE_WEB_CLIENT_SECRET=secret \
    node dist/server.js --smoke-test

# Stage 3: Installer - Install only production dependencies
FROM base AS installer
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/yarn.lock ./yarn.lock

RUN --mount=type=cache,target=/root/.yarn \
    yarn install --frozen-lockfile --production=true

# Stage 4: Runner - Production runtime
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy production dependencies and built packages
COPY --from=installer --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=nodejs:nodejs /app/packages ./packages

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/package.json ./apps/backend/package.json

# Copy built package outputs
COPY --from=builder --chown=nodejs:nodejs /app/packages/zod-schemas/dist ./packages/zod-schemas/dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/typescript-config ./packages/typescript-config

# Add entrypoint script
COPY --chown=nodejs:nodejs apps/backend/scripts/docker-entrypoint.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Remove declaration files from migrations directory to prevent rake-db errors
RUN find ./apps/backend/dist/db/migrations -type f \( -name "*.d.ts" -o -name "*.d.ts.map" \) -delete
# Install curl for the healthcheck
RUN apk add --no-cache curl

USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV TZ=Etc/UTC

# ============================================================================
# GRACEFUL SHUTDOWN CONFIGURATION
# ============================================================================
ENV GRACEFUL_SHUTDOWN_TIMEOUT=30000
ENV AGENT_TASK_TIMEOUT=300000
ENV DOCKER_STOP_TIMEOUT=310

# ============================================================================
# ORCHESTRATOR CONFIGURATION (Kubernetes/Docker Swarm)
# ============================================================================
# Docker Swarm: order: start-first | Kubernetes: strategy: RollingUpdate
# ============================================================================

WORKDIR /app/apps/backend
EXPOSE 3000

# ============================================================================
# HEALTH CHECK CONFIGURATION
# ============================================================================
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD response=$(curl -fsS http://localhost:3000/) && \
      echo "$response" && \
      echo "$response" | grep -q '"status":"ok"' || exit 1

STOPSIGNAL SIGTERM

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]