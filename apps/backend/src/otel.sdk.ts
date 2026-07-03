// Initialize OpenTelemetry + Sentry before the HTTP server (or any instrumented module) loads.
import { env, isDev, isProd } from "@backend/configs/env.config";
import {
	CompositePropagator,
	W3CBaggagePropagator,
	W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ORPCInstrumentation } from "@orpc/otel";
import * as Sentry from "@sentry/node";
import {
	SentryPropagator,
	SentrySampler,
	SentrySpanProcessor,
} from "@sentry/opentelemetry";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { normalizeUrl, normalizeUrlPath } from "@backend/utils/sentry_url_template";

const sentryClient = Sentry.init({
	dsn: env.SENTRY_DSN,
	// `enabled: false` makes every Sentry.* call a no-op, so the SDK is safe to
	// keep wired up everywhere even when no DSN is configured (CI, local dev).
	enabled: Boolean(env.SENTRY_DSN),
	environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
	release: env.SENTRY_RELEASE,
	sampleRate: 1.0,
	skipOpenTelemetrySetup: true,
	integrations: [
		nodeProfilingIntegration(),
		// Our own HttpInstrumentation creates spans — disable Sentry's so we don't double-count.
		Sentry.httpIntegration({ spans: false }),
		// Pino → Sentry as breadcrumbs (not events) is wired in utils/logger.utils.ts.
		// Sentry's pinoIntegration sends logs as events, which floods the issue list.
	],
	enableLogs: false,
	// Also emit W3C `traceparent` on outbound HTTP so non-Sentry consumers
	// (Datadog, Honeycomb, Jaeger, etc.) can stitch our traces. Sentry always
	// emits `sentry-trace` + `baggage` — this adds `traceparent` alongside.
	propagateTraceparent: true,
	// PII/secret scrubbing: keep `sendDefaultPii` off until an explicit allowlist
	// lands. `sendDefaultPii: true` opts into user IP, user-agent, and request
	// headers on errors — which would ship `Authorization`, `Cookie`, `x-api-key`,
	// and `x-tbus-*` tokens straight to Sentry.
	sendDefaultPii: false,
	profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE ?? 0,
	tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? 0.1 : 1.0),
	// Strip bound SQL parameter values from Postgres spans before they leave the
	// process. `PgInstrumentation({ enhancedDatabaseReporting: true })` attaches
	// the parameter array to every span as `db.statement.parameters` (and the
	// `values` attribute on some OTel versions) — those values include password
	// hashes, `apiSecretHash`, `subscriptionAlertWebhookBearerToken`, OTP codes,
	// session tokens, and user emails. Drop them here so neither Sentry nor the
	// OTLP exporter ever sees them.
	beforeSendSpan: (span) => {
		if (span.data) {
			delete span.data["db.statement.parameters"];
			delete span.data["db.sql.parameters"];
			delete span.data.values;
		}
		return span;
	},
	// Collapse ULID/UUID/6+digit path segments to `:id` so events group by
	// URL shape rather than by unique row id.
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

export const otelNodeSdk = new NodeSDK({
	contextManager: new Sentry.SentryContextManager(),

	resource: resourceFromAttributes({
		"service.name": env.OTEL_SERVICE_NAME,
		"deployment.environment": env.SENTRY_ENVIRONMENT || env.NODE_ENV,
	}),
	sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
	// Composite: emit W3C `traceparent` + `baggage` on every outbound call
	// (the vendor-neutral standard — Datadog / Honeycomb / OTel all read it),
	// and also emit Sentry's `sentry-trace` so existing Sentry-instrumented
	// services continue to stitch. Inbound extraction tries every propagator
	// in order and uses whichever header is present.
	textMapPropagator: new CompositePropagator({
		propagators: [
			new W3CTraceContextPropagator(),
			new W3CBaggagePropagator(),
			new SentryPropagator(),
		],
	}),
	spanProcessors: [
		new SentrySpanProcessor(),
		...(env.OTEL_TRACE_EXPORTER_URL
			? [
					new BatchSpanProcessor(
						new OTLPTraceExporter({
							url: env.OTEL_TRACE_EXPORTER_URL,
						}),
					),
				]
			: []),
	],
	instrumentations: [
		new ORPCInstrumentation(),
		new PgInstrumentation({
			requireParentSpan: true,
			enhancedDatabaseReporting: true,
		}),
		new HttpInstrumentation(),
	],
});

otelNodeSdk.start();
Sentry.validateOpenTelemetrySetup();

if (isDev) {
	console.info("Backend Sentry initialized:", Sentry.isInitialized());
}
