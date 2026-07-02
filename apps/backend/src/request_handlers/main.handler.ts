import { env, isDev } from "@backend/configs/env.config";
import { betterAuthHandler } from "@backend/request_handlers/better_auth.handler";
import { novuHandler } from "@backend/request_handlers/novu.handler";
import { openApiHandler } from "@backend/request_handlers/open_api.handler";
import { superAdminHandler } from "@backend/request_handlers/super_admin.handler";
import { reactAppHandler } from "@backend/request_handlers/user_app.handler";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import {
	decrementActiveRequests,
	getServerHealth,
	incrementActiveRequests,
} from "@backend/utils/graceful_shutdown.utils";
import { logger } from "@backend/utils/logger.utils";
import { trace } from "@opentelemetry/api";
import type {
	NodeHttpRequest,
	NodeHttpResponse,
} from "@orpc/standard-server-node";
import { mobileAppHandler } from "./mobile_app.handler";

/**
 * Main request dispatcher that orchestrates all handlers and pre-checks.
 */
export async function mainRequestDispatcher(
	req: NodeHttpRequest,
	res: NodeHttpResponse,
) {
	incrementActiveRequests();

	const requestUrl = req.url;
	const method = req.method?.toUpperCase();

	// 1. High-level Logging & Trace ID
	const currentSpan = trace.getActiveSpan();
	if (currentSpan) {
		const spanContext = currentSpan.spanContext();
		res.setHeader("x-trace-id", spanContext.traceId);
		// W3C Trace Context — sampled flag is bit 0 of traceFlags.
		// Format: 00-<32-hex traceId>-<16-hex spanId>-<2-hex flags>
		const flags = (spanContext.traceFlags & 0x01) === 0x01 ? "01" : "00";
		res.setHeader(
			"traceparent",
			`00-${spanContext.traceId}-${spanContext.spanId}-${flags}`,
		);
	}

	// 2. Health & Shutdown Check
	const health = getServerHealth();
	if (health.status === "shutting_down") {
		res.statusCode = 503;
		res.setHeader("Content-Type", "application/json");
		res.setHeader("Connection", "close");
		res.end(
			JSON.stringify({
				status: "unavailable",
				message: "Server is shutting down",
				timestamp: health.timestamp,
			}),
		);
		decrementActiveRequests();
		return;
	}

	try {
		// 3. Auth Routes (/api/auth/*)
		// Note: /api/sentry-tunnel is proxied directly to Sentry by the
		// frontend nginx (see nginx.conf.template) and never reaches this
		// dispatcher.
		if (requestUrl?.startsWith("/api/auth")) {
			return await betterAuthHandler.handle(req, res);
		}

		// 3b. Novu Framework bridge (/api/novu/*) — used by `npx novu sync`
		// to discover code-defined workflows in apps/backend/src/novu/.
		if (requestUrl?.startsWith("/api/novu")) {
			return await novuHandler.handle(req, res);
		}

		// 3c. oRPC User App Routes (/api/user-app/*)
		// Must run BEFORE the /api/* OpenAPI catch-all so oRPC procedures
		// aren't mistaken for OpenAPI routes.
		if (requestUrl?.startsWith("/api/user-app")) {
			const reactAppResult = await reactAppHandler.handle(req, res, {
				context: {},
				prefix: "/api/user-app",
			});
			if (reactAppResult.matched) return;
		}

		// 4. Root Path / Health Check
		if (
			requestUrl === "/" ||
			requestUrl === "/health" ||
			requestUrl?.startsWith("/?")
		) {
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json");
			res.end(
				JSON.stringify({
					status: health.status,
					service: env.OTEL_SERVICE_NAME,
					environment: env.NODE_ENV,
					timestamp: health.timestamp,
					activeRequests: health.activeRequests,
					message: "Server is running",
					httpVersion: req.httpVersion,
					secure: false,
				}),
			);
			return;
		}

		// 6. OpenAPI Routes (/api/*)
		const openApiResult = await openApiHandler.handle(req, res, {
			context: {},
			prefix: "/api",
		});
		if (openApiResult.matched) return;

		// 7. Super-Admin Routes (/super-admin/*)
		const superAdminResult = await superAdminHandler.handle(req, res, {
			context: {},
			prefix: "/super-admin",
		});
		if (superAdminResult.matched) return;

		// 9. Mobile App Routes (/mobile-app/*)
		const mobileAppResult = await mobileAppHandler.handle(req, res, {
			context: {},
			prefix: "/mobile-app",
		});
		if (mobileAppResult.matched) return;

		if (!res.writableEnded) {
			res.statusCode = 404;
			res.end("No procedure matched");
		}
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		captureBackendException(err, {
			context: { url: requestUrl, method },
			tags: { handler: "main_request_dispatcher" },
		});
		logger.error({ err, url: requestUrl, method }, "Unhandled request error");

		if (!res.writableEnded) {
			res.statusCode = 500;
			res.setHeader("Content-Type", "application/json");
			res.end(
				JSON.stringify({
					error: "Internal Server Error",
					message: isDev ? err.message : "An unexpected error occurred",
					stack: isDev ? err.stack : undefined,
				}),
			);
		}
	} finally {
		decrementActiveRequests();
	}
}
