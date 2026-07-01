// Initialize OpenTelemetry + Sentry before the HTTP server (or any instrumented module) loads.
import { env, isDev, isProd } from "@backend/configs/env.config";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ORPCInstrumentation } from "@orpc/otel";
import * as Sentry from "@sentry/node";
import { SentryPropagator, SentrySampler, SentrySpanProcessor } from "@sentry/opentelemetry";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

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
	sendDefaultPii: true,
	profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE ?? 0,
	tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? (isProd ? 0.1 : 1.0),
});

export const otelNodeSdk = new NodeSDK({
	contextManager: new Sentry.SentryContextManager(),

	resource: resourceFromAttributes({
		"service.name": env.OTEL_SERVICE_NAME,
		"deployment.environment": env.SENTRY_ENVIRONMENT || env.NODE_ENV,
	}),
	sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
	textMapPropagator: new SentryPropagator(),
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
