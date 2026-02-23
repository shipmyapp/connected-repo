import { env, isDev } from "@frontend/configs/env.config";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router";
import pkg from "../package.json";

/**
 * Lazily initializes Sentry instrumentation.
 * This keeps the SDK out of the initial bundle.
 */
export async function initInstrumentation() {
  const Sentry = await import("@sentry/react");
  const { useEffect } = await import("react");
  const {
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
  } = await import("react-router");

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
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
      // Sentry.feedbackIntegration({
      //   // Additional SDK configuration goes in here, for example:
      //   colorScheme: "system",
      // }),
      Sentry.replayIntegration({
        attachRawBodyFromRequest: true,
        blockAllMedia: false,
        maskAllInputs: false,
        maskAllText: false,
        stickySession: true,
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
    tracesSampleRate: isDev ? 0 : 1.0,
    // Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
    tracePropagationTargets: [
      "localhost",
      env.VITE_API_URL
    ],
    // FIXME: Setup tunneling to avoid ad-blocker issues
    // tunnel: "/tunnel",
    replaysSessionSampleRate: isDev ? 0 : 0.1,
    replaysOnErrorSampleRate: isDev ? 0 : 1.0,
  });

  console.info("[Instrumentation] Sentry initialized asynchronously.");
};

/**
 * Lazily capture a message in Sentry.
 */
export async function captureSentryMessage(message: string, options?: any) {
  const Sentry = await import("@sentry/react");
  return Sentry.captureMessage(message, options);
};

/**
 * Lazily set the Sentry user.
 */
export async function setSentryUser(user: { email?: string; username?: string; id?: string }) {
  const Sentry = await import("@sentry/react");
  return Sentry.setUser(user);
};
