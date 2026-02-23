// Initialize OpenTelemetry and Sentry
import { env, isDev } from '@backend/configs/env.config';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ORPCInstrumentation } from '@orpc/otel';
import * as Sentry from '@sentry/node';
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor
} from "@sentry/opentelemetry";
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const sentryClient = Sentry.init({
  dsn: env.VITE_SENTRY_DSN,
  environment: env.VITE_SENTRY_ENV || env.NODE_ENV,
  sampleRate: isDev ? 0 : 1.0, // 100% for dev, 10% for prod
  skipOpenTelemetrySetup: true, // disables the Sentry SDK's automatic OpenTelemetry configuration
  integrations: [
    // Add profiling integration
    nodeProfilingIntegration(),
    // We have our own @opentelemetry/instrumentation-http instance in your OpenTelemetry setup.
    // Hence disabled span creation in Sentry's httpIntegration
    Sentry.httpIntegration({ spans: false }),
    // Pino integration for structured logging
    Sentry.pinoIntegration({
      log: { levels: ['debug', 'info', 'warn', 'error'] },
      error: { levels: ['error'] }
    }),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  enableLogs: true,
  sendDefaultPii: true,
  // need with profiling integration
  profilesSampleRate: isDev ? 0 : 1.0,
  // Enable tracing
  tracesSampleRate: isDev ? 0 : 1.0,
});

export const otelNodeSdk = new NodeSDK({
    contextManager: new Sentry.SentryContextManager(),
    
    resource: resourceFromAttributes({
      'service.name': env.OTEL_SERVICE_NAME,
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
            })
          )
        ]
        : []
      )
    ],
    instrumentations: [
      new ORPCInstrumentation(),
      new PgInstrumentation({
        // Capture query parameters in spans
        requireParentSpan: true,
        // Enhanced database error capture
        enhancedDatabaseReporting: true,
      }),
      new HttpInstrumentation(),
    ],
  });

// Start the SDK
otelNodeSdk.start();
Sentry.validateOpenTelemetrySetup();
console.info("Sentry is initialized:", Sentry.isInitialized ? Sentry.isInitialized() : "unknown");

// Test capture
Sentry.captureMessage("Server start: Server has started", "info");