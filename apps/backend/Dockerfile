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
USER nodejs

# Set environment variables
ENV NODE_ENV=production

# Set working directory to the backend app
WORKDIR /app/apps/backend

# Expose the port (adjust if your backend uses a different port)
EXPOSE 3000

# Add Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD response=$(curl -s http://localhost:3000/api/health) && \
      echo "$response" && \
      echo "$response" | grep -q '"status":"ok"' || exit 1

# Run migrations then start the backend server
CMD ["sh", "-c", "node dist/db/db_script.js up && node dist/server.js"]
