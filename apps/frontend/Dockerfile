# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# Stage 1: Prepare - Prune the monorepo to only include frontend and its dependencies
FROM base AS prepare
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN yarn global add turbo
COPY . .
RUN turbo prune @connected-repo/frontend --docker

# Stage 2: Builder - Install dependencies and build
FROM base AS builder
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/yarn.lock ./yarn.lock

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
ARG VITE_SENTRY_AUTH_TOKEN=""
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
    VITE_SENTRY_AUTH_TOKEN=$VITE_SENTRY_AUTH_TOKEN \
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
    npx turbo run build --filter=@connected-repo/frontend

# Stage 3: Runner - nginx serving static bundle + reverse proxy to backend
FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/frontend/docker-entrypoint.sh /docker-entrypoint.d/40-render-nginx-conf.sh
RUN chmod +x /docker-entrypoint.d/40-render-nginx-conf.sh

# Reverse-proxy target. Overridden by docker-compose to point at the internal
# backend service (e.g. "backend:3000") on the shared Docker network.
ENV BACKEND_UPSTREAM=backend:3000

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1
