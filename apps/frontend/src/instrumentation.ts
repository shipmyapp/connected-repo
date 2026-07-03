import { env, isDev } from "@frontend/configs/env.config";
import {
  normalizeUrl,
  normalizeUrlPath,
} from "@frontend/utils/sentry_url_template";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router";
import pkg from "../package.json";

/**
 * Detect whether the Sentry ingest host is reachable from this browser.
 * Ad-blockers (uBlock, Brave Shields, Firefox strict tracking protection)
 * block `*.ingest.sentry.io` by URL pattern — the outbound `fetch` throws
 * a TypeError before it hits the network. When that happens we route
 * envelopes through our same-origin tunnel instead.
 *
 * `no-cors` + `HEAD` = we don't need to read the response, we only need
 * to know whether the request left the browser. AbortController caps the
 * wait so the Sentry init isn't stalled on a slow probe.
 */
async function isSentryIngestBlocked(dsn: string): Promise<boolean> {
  try {
    const url = new URL(dsn);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1500);
    try {
      // Probe /favicon.ico rather than /api/ — the former is served 200 by
      // most CDN-fronted hosts (including Sentry's ingest), so DevTools
      // doesn't flag it as a failed resource. If Sentry ever stops serving
      // favicon.ico, the probe still works (any response = reachable), the
      // console will just complain again.
      // no-cors keeps the response opaque; we only care whether fetch throws.
      await fetch(`${url.protocol}//${url.host}/favicon.ico`, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: ac.signal,
      });
      return false;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // fetch throw → blocked (or offline; offline case is harmless, tunnel
    // will also fail but we haven't wasted a direct ingest attempt).
    return true;
  }
}

/**
 * Lazily initializes Sentry instrumentation.
 * This keeps the SDK out of the initial bundle.
 */
export async function initInstrumentation() {
  const Sentry = await import("@sentry/react");

  const useTunnel = env.VITE_SENTRY_DSN
    ? await isSentryIngestBlocked(env.VITE_SENTRY_DSN)
    : false;

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
    // Also emit W3C `traceparent` on outbound fetches so the backend (and any
    // downstream) stitches under the vendor-neutral standard, not just Sentry's
    // own `sentry-trace` header.
    propagateTraceparent: true,
    tracesSampleRate: isDev ? 0 : 1.0,
    // Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
    // Empty VITE_API_URL = same-origin deploy; the /api/ path prefix is the
    // only reliable marker to propagate traces on since we can't compare hosts.
    tracePropagationTargets: [
      "localhost",
      ...(env.VITE_API_URL ? [env.VITE_API_URL] : [/^\/api\//]),
    ],
    // Same-origin envelope tunnel — only wired in when the probe above found
    // that *.ingest.sentry.io is blocked (ad-blocker / privacy extension /
    // corporate proxy). Direct ingestion is preferred otherwise: it avoids a
    // backend round-trip and keeps envelope size out of our egress budget.
    // Backend gates the tunnel on SENTRY_TUNNEL_ALLOWED_DSNS.
    tunnel: useTunnel ? "/api/sentry-tunnel" : undefined,
    replaysSessionSampleRate: isDev ? 0 : 0.1,
    replaysOnErrorSampleRate: isDev ? 0 : 1.0,
    // Collapse ULID/UUID/6+digit path segments to `:id` so events group
    // by URL shape rather than by unique row id — see utils/sentry_url_template.
    beforeSend: (event) => {
      if (event.transaction) {
        event.transaction = normalizeUrlPath(event.transaction);
      }
      if (event.request?.url) {
        event.request.url = normalizeUrl(event.request.url);
      }
      return event;
    },
    beforeSendTransaction: (event) => {
      if (event.transaction) {
        event.transaction = normalizeUrlPath(event.transaction);
      }
      if (event.request?.url) {
        event.request.url = normalizeUrl(event.request.url);
      }
      return event;
    },
  });
};

/**
 * Lazily capture a message in Sentry.
 */
export async function captureSentryMessage(
  message: string,
  options?: Parameters<typeof import("@sentry/react").captureMessage>[1],
) {
  const Sentry = await import("@sentry/react");
  return Sentry.captureMessage(message, options);
}

/**
 * Lazily set the Sentry user.
 */
export async function setSentryUser(user: { email?: string; username?: string; id?: string }) {
  const Sentry = await import("@sentry/react");
  return Sentry.setUser(user);
};
