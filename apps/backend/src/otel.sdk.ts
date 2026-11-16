// Initialize Sentry before the HTTP server (or any instrumented module) loads:
// its runtime hooks instrument `pg` and the other libraries as they are required.
import { subscribe } from "node:diagnostics_channel";
import { readFileSync } from "node:fs";
import { IncomingMessage } from "node:http";
import path from "node:path";
import { env, isProd } from "@backend/configs/env.config";
import { normalizeUrl, normalizeUrlPath } from "@backend/utils/sentry_url_template";
import { ORPCInstrumentation } from "@orpc/otel";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

/**
 * Requests that arrive constantly and say nothing on their own: health
 * checks (Docker/Dokploy probe every few seconds) and the Sentry tunnel.
 * Never traced, so they do not eat the span quota.
 */
const UNTRACED_PATHS = [/^\/health\b/, /^\/?$/, /^\/\?/, /^\/api\/sentry-tunnel\b/];

const isUntracedPath = (urlPath: string): boolean =>
	UNTRACED_PATHS.some((pattern) => pattern.test(urlPath));

/**
 * Headers whose values may reach Sentry. Everything else (cookies,
 * `Authorization`, `x-api-key`, `x-tbus-*`, the device header, forwarding
 * and client-IP headers) is sent as a name only. An allow list, so a new
 * credential header is never sent by mistake.
 */
const HARMLESS_REQUEST_HEADERS = ["accept", "content-type", "content-length", "user-agent"];
const HARMLESS_RESPONSE_HEADERS = ["content-type", "content-length"];

/**
 * Everything the SDK may collect on its own, set explicitly: Sentry 11
 * collects user info, cookies, headers, bodies and database query data
 * unless told otherwise. The user is named by id alone (`Sentry.setUser`).
 */
const BACKEND_DATA_COLLECTION = {
	userInfo: false,
	cookies: false,
	httpHeaders: {
		request: { allow: HARMLESS_REQUEST_HEADERS },
		response: { allow: HARMLESS_RESPONSE_HEADERS },
	},
	httpBodies: [],
	urlQueryParams: false,
	graphQL: { document: false, variables: false },
	genAI: { inputs: false, outputs: false },
	mcp: { inputs: false, outputs: false },
	databaseQueryData: false,
	queues: false,
	stackFrameVariables: false,
} satisfies Sentry.NodeOptions["dataCollection"];

/** A span describing a database or Redis call (its attributes at start). */
const isDatabaseWork = (attributes: Record<string, unknown> | undefined): boolean => {
	if (!attributes) return false;
	const op = attributes["sentry.op"];
	return (
		attributes["db.system.name"] !== undefined ||
		attributes["db.operation.name"] !== undefined ||
		(typeof op === "string" && (op === "db" || op.startsWith("db.") || op.startsWith("cache.")))
	);
};

/** Span attributes that hold bound SQL parameter values (old and current names). */
const isSqlParameterAttribute = (key: string): boolean =>
	key === "db.statement.parameters" ||
	key === "db.sql.parameters" ||
	key === "values" ||
	key.startsWith("db.query.parameter");

/** Span attributes that hold a full URL, a path, or a query string. */
const FULL_URL_ATTRIBUTES = ["url.full", "http.url"];
const PATH_ATTRIBUTES = ["url.path", "http.target", "http.route", "sentry.segment.name"];
const QUERY_ATTRIBUTES = ["url.query", "http.query", "url.fragment", "http.fragment"];
/** Span attributes that hold the client's (or the proxy's) IP address. */
const ADDRESS_ATTRIBUTES = [
	"client.address",
	"http.client_ip",
	"network.peer.address",
	"net.peer.ip",
	"user.ip_address",
];

type StreamedSpan = Parameters<NonNullable<Sentry.NodeOptions["beforeSendSpan"]>>[0];

/**
 * The last edit of every span before it leaves the process: no bound SQL
 * value (the second lock behind `databaseQueryData: false`), no client IP,
 * and URL-shaped names and attributes collapsed to `:id` without their query
 * string.
 */
const scrubSpan = (span: StreamedSpan): StreamedSpan => {
	span.name = normalizeUrlPath(span.name).replace(/\?.*$/, "");
	const attributes = span.attributes;
	if (!attributes) return span;
	// A Redis command's arguments are data (rate-limit keys name users, cached
	// values): keep the command only.
	const queryText = attributes["db.query.text"];
	if (attributes["db.system.name"] === "redis" && typeof queryText === "string") {
		attributes["db.query.text"] = queryText.trim().split(/\s+/)[0] ?? "";
	}
	for (const key of Object.keys(attributes)) {
		if (
			isSqlParameterAttribute(key) ||
			QUERY_ATTRIBUTES.includes(key) ||
			ADDRESS_ATTRIBUTES.includes(key)
		) {
			delete attributes[key];
			continue;
		}
		const value = attributes[key];
		if (typeof value !== "string") continue;
		if (FULL_URL_ATTRIBUTES.includes(key)) attributes[key] = normalizeUrl(value);
		else if (PATH_ATTRIBUTES.includes(key)) {
			attributes[key] = normalizeUrlPath(value).replace(/\?.*$/, "");
		}
	}
	return span;
};

const W3C_TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * W3C trace context in as well as out: Sentry continues an incoming trace
 * from `sentry-trace` only, so a request that carries just `traceparent`
 * (a service instrumented with OpenTelemetry) gets the equivalent
 * `sentry-trace` before Sentry reads the headers, and keeps the caller's
 * trace and sampling decision.
 */
const acceptW3cTraceparent = (message: unknown): void => {
	if (!(message instanceof Object) || !("request" in message)) return;
	const request = message.request;
	if (!(request instanceof IncomingMessage) || request.headers["sentry-trace"]) return;
	const traceparent = request.headers.traceparent;
	const match = typeof traceparent === "string" ? W3C_TRACEPARENT.exec(traceparent.trim()) : null;
	if (!match) return;
	const sampled = (Number.parseInt(match[3] ?? "0", 16) & 1) === 1 ? "1" : "0";
	request.headers["sentry-trace"] = `${match[1]}-${match[2]}-${sampled}`;
};

// Runs before Sentry's own handling of the request (it reads the headers
// when the server emits the request, after this channel's subscribers).
subscribe("http.server.request.start", acceptW3cTraceparent);

const readTrimmed = (file: string): string | undefined => {
	try {
		return readFileSync(file, "utf8").trim() || undefined;
	} catch {
		return undefined;
	}
};

const packageVersion = (file: string): string | undefined => {
	const text = readTrimmed(file);
	if (!text) return undefined;
	const parsed: { version?: unknown } = JSON.parse(text);
	return typeof parsed.version === "string" ? parsed.version : undefined;
};

/**
 * `<OTEL_SERVICE_NAME>@<short commit>`: the image build writes the commit to
 * `.build-sha` (apps/backend/Dockerfile), so every deploy is its own release.
 * SENTRY_RELEASE, when set, wins. A build without git, or a local run, falls
 * back to the package version.
 */
const sentryRelease = (): string | undefined => {
	if (env.SENTRY_RELEASE) return env.SENTRY_RELEASE;
	// dist/otel.sdk.js (or src/otel.sdk.ts under tsx) → apps/backend
	const backendDir = path.resolve(__dirname, "..");
	const version =
		readTrimmed(path.join(backendDir, ".build-sha")) ??
		packageVersion(path.join(backendDir, "package.json"));
	return version ? `${env.OTEL_SERVICE_NAME}@${version}` : undefined;
};

const release = sentryRelease();

Sentry.init({
	dsn: env.SENTRY_DSN,
	// `enabled: false` makes every Sentry.* call a no-op, so the SDK is safe to
	// keep wired up everywhere even when no DSN is configured (CI, local dev).
	enabled: Boolean(env.SENTRY_DSN),
	environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
	release,
	sampleRate: 1.0,
	// Sentry owns the spans. This also turns spans made through
	// `@opentelemetry/api` (oRPC's procedure spans, `recordErrorOtel`) into
	// Sentry spans in the same trace; there is no other trace destination.
	// Kept on for portability: the app makes its own spans through
	// `@opentelemetry/api`, never `Sentry.startSpan`, so another tracing
	// backend replaces this file and nothing else.
	enableOpenTelemetrySetup: true,
	dataCollection: BACKEND_DATA_COLLECTION,
	integrations: [
		nodeProfilingIntegration(),
		Sentry.httpIntegration({
			// Decided before the span exists: an untraced path never starts one.
			ignoreIncomingRequests: (urlPath) => isUntracedPath(urlPath),
			// Bodies are never read for Sentry (dataCollection says so too).
			maxRequestBodySize: "none",
		}),
		// Pino → Sentry as breadcrumbs (not events or Logs) is wired in
		// utils/logger.utils.ts. No logging integration is added here, so
		// nothing reaches Sentry Logs.
	],
	// Also emit W3C `traceparent` on outbound HTTP so non-Sentry consumers
	// (Datadog, Honeycomb, Jaeger, etc.) can stitch our traces. Sentry always
	// emits `sentry-trace` + `baggage`; this adds `traceparent` alongside.
	propagateTraceparent: true,
	// Continuous profiling while a traced request runs. Off unless set.
	profileSessionSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE ?? 0,
	profileLifecycle: "trace",
	// Runs for the spans that start a trace. Database and Redis work that no
	// request started (the pg-tbus poller, crons, the Redis health ping) would
	// otherwise be a root span each time; Postgres spans also need a parent.
	tracesSampler: ({ name, attributes, inheritOrSampleWith }) => {
		if (isDatabaseWork(attributes)) return 0;
		const urlPath = String(attributes?.["url.path"] ?? attributes?.["http.target"] ?? name ?? "");
		if (isUntracedPath(urlPath)) return 0;
		return inheritOrSampleWith(env.SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? 0.1 : 1.0));
	},
	beforeSendSpan: scrubSpan,
	// Collapse ULID/UUID/6+digit path segments to `:id` so events group by
	// URL shape rather than by unique row id; the query string is dropped.
	beforeSend: (event) => {
		if (event.transaction) {
			event.transaction = normalizeUrlPath(event.transaction).replace(/\?.*$/, "");
		}
		if (event.request?.url) {
			event.request.url = normalizeUrl(event.request.url);
		}
		if (event.request) delete event.request.query_string;
		return event;
	},
});

// oRPC creates its procedure spans through `@opentelemetry/api`; constructing
// the instrumentation enables it against the tracer provider Sentry registered.
new ORPCInstrumentation();

// One line on every start, whatever LOG_LEVEL says, so a container's output
// always shows whether errors and traces can reach Sentry.
console.info(
	env.SENTRY_DSN && Sentry.isInitialized()
		? `Sentry: on (environment ${env.SENTRY_ENVIRONMENT || env.NODE_ENV}, release ${release ?? "unset"})`
		: "Sentry: off (SENTRY_DSN is empty)",
);
