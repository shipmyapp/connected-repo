# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# Stage 1: Prepare - Prune the monorepo to only include backend and its dependencies
# This stage automatically excludes frontend changes via turbo prune
# Only backend, zod-schemas, and typescript-config packages are included
FROM base AS prepare
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn global add turbo
COPY . .
RUN turbo prune @connected-repo/backend --docker

# Stage 2: Builder - Install dependencies and build
FROM base AS builder
WORKDIR /app

# Enable Corepack and set up Yarn
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# First install dependencies (as they change less often)
# This layer is cached unless package.json or yarn.lock changes
# Frontend changes DO NOT invalidate this cache layer
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/yarn.lock ./yarn.lock

# Install dependencies
RUN --mount=type=cache,target=/root/.yarn \
    yarn install --frozen-lockfile --production=false

# Build the project and its dependencies
# This layer is cached unless backend/zod-schemas/typescript-config source changes
# Frontend changes DO NOT invalidate this cache layer (excluded by turbo prune)
COPY --from=prepare /app/out/full/ .

# Enable Turbo remote caching for faster builds (optional but recommended)
# ARG TURBO_TEAM
# ENV TURBO_TEAM=$TURBO_TEAM

# ARG TURBO_TOKEN
# ENV TURBO_TOKEN=$TURBO_TOKEN

# Run build
RUN --mount=type=cache,target=/app/node_modules/.cache/turbo \
    npx turbo run build --filter=@connected-repo/backend

# Stage 3: Installer - Install only production dependencies
FROM base AS installer
WORKDIR /app

# Enable Corepack and set up Yarn
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Copy package files for production install
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/yarn.lock ./yarn.lock

# Install only production dependencies
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


USER root
# Remove declaration files from migrations directory to prevent rake-db errors
RUN find ./apps/backend/dist/db/migrations -type f \( -name "*.d.ts" -o -name "*.d.ts.map" \) -delete
# Install curl for the healthcheck
RUN apk add --no-cache curl
# Copy entrypoint script
COPY --from=builder --chown=nodejs:nodejs /app/apps/backend/entrypoint.sh ./apps/backend/entrypoint.sh
RUN chmod +x ./apps/backend/entrypoint.sh
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV TZ=Etc/UTC

# ============================================================================
# GRACEFUL SHUTDOWN CONFIGURATION
# ============================================================================
# These timeouts ensure zero-downtime deployments with orchestrator parallelism
# (start-first, stop-later strategy). The old container keeps running until
# the new one is healthy and all active requests complete.

# Timeout for regular HTTP requests to complete (30 seconds default)
# After this time, remaining connections are forcefully closed
ENV GRACEFUL_SHUTDOWN_TIMEOUT=30000

# Extended timeout for long-running agent tasks like AI processing, webhooks,
# and background jobs. Some agents may run for several minutes.
# Maximum 5 minutes to prevent indefinite hanging
ENV AGENT_TASK_TIMEOUT=300000

# Kubernetes/Docker stop signal handling - must match docker stop timeout
# This should be set to AGENT_TASK_TIMEOUT + buffer (e.g., 5min 10s = 310s)
# The orchestrator should have: terminationGracePeriodSeconds: 310
ENV DOCKER_STOP_TIMEOUT=310

# ============================================================================
# ORCHESTRATOR CONFIGURATION (Kubernetes/Docker Swarm)
# ============================================================================
# These labels and settings enable "start-first, stop-later" (parallelism):
#
# Docker Swarm:
#   deploy:
#     update_config:
#       parallelism: 1          # Update 1 replica at a time
#       delay: 10s              # Wait between updates
#       order: start-first      # Start new container before stopping old
#       failure_action: rollback
#       monitor: 30s            # Monitor for 30s before considering success
#
# Kubernetes:
#   strategy:
#     type: RollingUpdate
#     rollingUpdate:
#       maxSurge: 1             # Start 1 extra pod during update
#       maxUnavailable: 0       # Never have unavailable pods
#   spec:
#     terminationGracePeriodSeconds: 310  # Must match DOCKER_STOP_TIMEOUT
#     containers:
#     - name: backend
#       lifecycle:
#         preStop:
#           exec:
#             command: ["/bin/sh", "-c", "sleep 5"]  # Allow time for readiness to fail
#
# ============================================================================

# Set working directory to the backend app
WORKDIR /app/apps/backend

# Expose the port (adjust if your backend uses a different port)
EXPOSE 3000

# ============================================================================
# HEALTH CHECK CONFIGURATION
# ============================================================================
# The healthcheck is critical for orchestrator "start-first, stop-later" strategy.
# It must return 200 OK when the server is ready to accept traffic.
#
# When SIGTERM is received:
# 1. Server stops accepting new connections (returns 503)
# 2. Healthcheck starts failing
# 3. Orchestrator routes traffic to new container
# 4. Old container waits for active requests to complete (up to AGENT_TASK_TIMEOUT)
# 5. Old container exits cleanly
#
# --interval=15s: Check every 15 seconds
# --timeout=5s: Command must complete within 5 seconds
# --start-period=30s: Grace period during startup (allows migrations to run)
# --retries=3: Mark unhealthy after 3 consecutive failures
# --start-interval=5s: Check more frequently during startup (Docker 25.0+)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD response=$(curl -fsS http://localhost:3000/) && \
      echo "$response" && \
      echo "$response" | grep -q '"status":"ok"' || exit 1

# ============================================================================
# STOP SIGNAL CONFIGURATION
# ============================================================================
# Explicitly use SIGTERM for graceful shutdown.
# The container runtime will wait DOCKER_STOP_TIMEOUT seconds before sending SIGKILL.
# This MUST be longer than AGENT_TASK_TIMEOUT to allow graceful completion.
STOPSIGNAL SIGTERM

# ============================================================================
# START COMMAND
# ============================================================================
# 1. Run database migrations first (blocking)
# 2. Start the server
# Both steps must complete successfully before healthcheck passes
# The exec command replaces the shell process with the Node process, making Node PID 1
CMD ["sh", "-c", "node dist/db/db_script.js up && exec node dist/server.js"]
