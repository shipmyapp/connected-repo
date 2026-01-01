import { env } from "@frontend/configs/env.config";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router";
import pkg from "../package.json";

Sentry.init({
  dsn: env.VITE_SENTRY_DSN,
  release: `${env.VITE_OTEL_SERVICE_NAME}@${env.VITE_SENTRY_RELEASE || pkg.version}`,
  environment: env.VITE_SENTRY_ENV || env.VITE_USER_NODE_ENV,
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
  integrations: [
    // If you're using react router, use the integration for your react router version instead.
    // Learn more at
    // https://docs.sentry.io/platforms/javascript/guides/react/configuration/integrations/react-router/
    Sentry.browserProfilingIntegration(),
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      // Additional SDK configuration goes in here, for example:
      colorScheme: "system",
    }),
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],
  // Enable logs to be sent to Sentry
  enableLogs: true,
  profileLifecycle: "trace",
  tracesSampleRate: 1.0,
  // Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
  tracePropagationTargets: [
    "localhost",
    env.VITE_API_URL
  ],
  // FIXME: Setup tunneling to avoid ad-blocker issues
  // tunnel: "/tunnel",
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});