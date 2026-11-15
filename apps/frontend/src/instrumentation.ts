import { env, isDev } from "@frontend/configs/env.config";
import { sentryReleaseName } from "@frontend/configs/sentry_release.config";
import { fallbackToTunnel } from "@frontend/utils/sentry_transport";
import { normalizeUrl, normalizeUrlPath } from "@frontend/utils/sentry_url_template";
import { useEffect } from "react";
import {
	createRoutesFromChildren,
	matchRoutes,
	useLocation,
	useNavigationType,
} from "react-router";
import pkg from "../package.json";

/** Same origin, so blockers that drop *.ingest.sentry.io let it through (the frontend's nginx forwards it). */
const SENTRY_TUNNEL = "/api/sentry-tunnel";

/**
 * Defaults that fit Sentry's free plan (every error, a replay only with an
 * error, a share of page loads); each can be changed from the build's
 * environment (VITE_SENTRY_*_SAMPLE_RATE).
 */
const DEFAULT_TRACES_SAMPLE_RATE = 0.3;
const DEFAULT_REPLAYS_SESSION_SAMPLE_RATE = 0;
const DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE = 1;

/** Errors that are the network or the browser, not the app: they would only spend the error allowance. */
const IGNORED_ERRORS = [
	"ResizeObserver loop limit exceeded",
	"ResizeObserver loop completed with undelivered notifications",
	"Failed to fetch",
	"Load failed",
	"NetworkError when attempting to fetch resource",
	"The user aborted a request",
	"AbortError",
	"Non-Error promise rejection captured",
];

/**
 * Lazily initializes Sentry instrumentation.
 * This keeps the SDK out of the initial bundle.
 */
export async function initInstrumentation() {
	const Sentry = await import("@sentry/react");

	// Direct first; the tunnel only after a direct send fails while online (an
	// ad-blocker). No probe request at boot. Vite's dev server has no tunnel.
	const transport = fallbackToTunnel(Sentry.makeFetchTransport, {
		tunnelUrl: SENTRY_TUNNEL,
		dsn: env.VITE_SENTRY_DSN,
		isEnabled: !isDev,
	});

	Sentry.init({
		dsn: env.VITE_SENTRY_DSN,
		release: sentryReleaseName(env.VITE_OTEL_SERVICE_NAME, env.VITE_SENTRY_RELEASE, pkg.version),
		environment: env.VITE_SENTRY_ENV || env.VITE_USER_NODE_ENV,
		// No IP address and no request headers: the user is named by id alone (setSentryUser).
		sendDefaultPii: false,
		integrations: [
			Sentry.browserProfilingIntegration(),
			Sentry.browserTracingIntegration(),
			// Warnings and errors go to Logs; a plain console.log is development noise.
			Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
			// A replay shows where people tapped and what broke, never what they
			// read or typed: every word, input and image is masked, and network
			// bodies are not recorded.
			Sentry.replayIntegration({
				maskAllText: true,
				maskAllInputs: true,
				blockAllMedia: true,
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
		enableLogs: true,
		profileLifecycle: "trace",
		// Also emit W3C `traceparent` on outbound fetches so the backend (and any
		// downstream) stitches under the vendor-neutral standard, not just Sentry's
		// own `sentry-trace` header.
		propagateTraceparent: true,
		tracesSampleRate: isDev
			? 0
			: (env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? DEFAULT_TRACES_SAMPLE_RATE),
		// Empty VITE_API_URL = same-origin deploy; the /api/ path prefix is the
		// only reliable marker to propagate traces on since we can't compare hosts.
		tracePropagationTargets: [
			"localhost",
			...(env.VITE_API_URL ? [env.VITE_API_URL] : [/^\/api\//]),
		],
		transport,
		replaysSessionSampleRate: isDev
			? 0
			: (env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? DEFAULT_REPLAYS_SESSION_SAMPLE_RATE),
		replaysOnErrorSampleRate: isDev
			? 0
			: (env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? DEFAULT_REPLAYS_ON_ERROR_SAMPLE_RATE),
		ignoreErrors: IGNORED_ERRORS,
		// Extensions and injected scripts are not ours.
		denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-web-extension:\/\//],
		// Collapse ULID/UUID/6+digit path segments to `:id` and drop query and
		// hash, so events group by URL shape — see utils/sentry_url_template.
		beforeSend: (event) => {
			if (event.transaction) event.transaction = normalizeUrlPath(event.transaction);
			if (event.request?.url) event.request.url = normalizeUrl(event.request.url);
			return event;
		},
		beforeSendTransaction: (event) => {
			if (event.transaction) event.transaction = normalizeUrlPath(event.transaction);
			if (event.request?.url) event.request.url = normalizeUrl(event.request.url);
			return event;
		},
		// Interaction and web-vital spans are sent on their own, past
		// beforeSendTransaction; their names and attributes carry URLs too.
		beforeSendSpan: (span) => {
			if (span.description) span.description = normalizeUrlPath(span.description);
			if (span.data) {
				for (const [key, value] of Object.entries(span.data)) {
					if (typeof value !== "string") continue;
					if (/^https?:\/\//.test(value)) span.data[key] = normalizeUrl(value);
					else if (value.startsWith("/")) span.data[key] = normalizeUrlPath(value);
				}
			}
			return span;
		},
		beforeBreadcrumb: (breadcrumb) => {
			// Navigation and fetch breadcrumbs carry URLs: the same shapes as above.
			const data = breadcrumb.data;
			if (data && typeof data.url === "string") data.url = normalizeUrl(data.url);
			if (data && typeof data.to === "string") data.to = normalizeUrlPath(data.to);
			if (data && typeof data.from === "string") data.from = normalizeUrlPath(data.from);
			return breadcrumb;
		},
	});
}

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
 * Reports a failure the app caught and showed on screen itself, which Sentry
 * would otherwise never see. Tags name where it failed; nothing a person
 * typed goes with it.
 */
export async function captureHandledError(error: unknown, tags: Record<string, string | number>) {
	if (!env.VITE_SENTRY_DSN) return;
	const Sentry = await import("@sentry/react");
	Sentry.withScope((scope) => {
		for (const [key, value] of Object.entries(tags)) scope.setTag(key, String(value));
		Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
	});
}

/** The top-level crash `AppErrorBoundary` caught (App.tsx). */
export async function captureTopLevelError(error: Error, componentStack?: string | null) {
	const Sentry = await import("@sentry/react");
	Sentry.withScope((scope) => {
		scope.setTag("level", "top-level");
		if (componentStack) scope.setExtra("componentStack", componentStack);
		Sentry.captureException(error);
	});
}

/**
 * Lazily set the Sentry user. Pass the id only (`sendDefaultPii: false`).
 */
export async function setSentryUser(user: { id: string }) {
	const Sentry = await import("@sentry/react");
	return Sentry.setUser(user);
}
