import { env, isDev } from "@backend/configs/env.config";
import { applyDeviceCookie } from "@backend/modules/devices/device_cookie.devices.middleware";
import { prepareAuthorizeClient } from "@backend/modules/user_mcp/services/client_metadata_document.user_mcp.service";
import { betterAuthHandler } from "@backend/request_handlers/better_auth.handler";
import {
	handleOAuthRegistration,
	isOAuthRegistrationRequest,
} from "@backend/request_handlers/oauth_registration.handler";
import { openApiHandler } from "@backend/request_handlers/open_api.handler";
import { superAdminHandler } from "@backend/request_handlers/super_admin.handler";
import {
	SUPER_ADMIN_RPC_PREFIX,
	superAdminRpcHandler,
} from "@backend/request_handlers/super_admin_rpc.handler";
import { tenantHandler } from "@backend/request_handlers/tenant.handler";
import { reactAppHandler } from "@backend/request_handlers/user_app.handler";
import { handleUserMcpRequest, userMcpRouteFor } from "@backend/request_handlers/user_mcp.handler";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { declaresTooLargeBody } from "@backend/utils/body_limit.utils";
import { stampClientIp } from "@backend/utils/client-info.utils";
import {
	decrementActiveRequests,
	getServerHealth,
	incrementActiveRequests,
} from "@backend/utils/graceful_shutdown.utils";
import { healthBody } from "@backend/utils/health_response.utils";
import { logger } from "@backend/utils/logger.utils";
import { nodeRequestHeaders } from "@backend/utils/node_headers.utils";
import { getRedisStatus } from "@backend/utils/redis.utils";
import { applyApiSecurityHeaders } from "@backend/utils/security_headers.utils";
import { trace } from "@opentelemetry/api";
import type { NodeHttpRequest, NodeHttpResponse } from "@orpc/standard-server-node";
import { mobileAppHandler } from "./mobile_app.handler";

/**
 * Main request dispatcher that orchestrates all handlers and pre-checks.
 */
export async function mainRequestDispatcher(req: NodeHttpRequest, res: NodeHttpResponse) {
	// The one place the client's address is decided (utils/client-info.utils.ts).
	stampClientIp(req);
	applyApiSecurityHeaders(res, req.url);
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
		res.setHeader("traceparent", `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`);
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

	// 2b. A declared body larger than the route accepts is refused before any
	// handler reads it. Streamed bodies are cut by each oRPC handler's
	// BodyLimitPlugin.
	if (declaresTooLargeBody(req.headers, requestUrl)) {
		res.statusCode = 413;
		res.setHeader("Content-Type", "application/json");
		res.setHeader("Connection", "close");
		res.end(JSON.stringify({ error: "Payload Too Large" }));
		decrementActiveRequests();
		return;
	}

	try {
		// 2c. The application MCP (ADR-045), first: on its own host
		// (MCP_PUBLIC_URL) it is the only thing served, and the app host
		// answers 404 for its paths. Bearer only: no device cookie.
		const mcpRoute = userMcpRouteFor(req.headers.host, requestUrl);
		if (mcpRoute === "serve") return await handleUserMcpRequest(req, res);
		if (mcpRoute === "not_found") {
			res.statusCode = 404;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: "Not found" }));
			return;
		}

		// 2d. Connected apps register themselves here, public or confidential;
		// Better Auth's own /oauth2/register takes confidential clients only
		// from a signed-in person, which no AI app is when it registers.
		if (isOAuthRegistrationRequest(requestUrl)) {
			return await handleOAuthRegistration(req, res);
		}

		// 2e. The device cookie: sign-in and the app's procedures carry it,
		// issued here when missing; bearer calls and other paths get none.
		applyDeviceCookie(req, res);

		// 3. Auth Routes (/api/auth/*)
		// Note: /api/sentry-tunnel is proxied directly to Sentry by the
		// frontend nginx (see nginx.conf.template) and never reaches this
		// dispatcher.
		if (requestUrl?.startsWith("/api/auth")) {
			// A connected app whose client_id is its metadata document is
			// fetched into oauth_clients before Better Auth looks it up.
			if (method === "GET" && requestUrl.startsWith("/api/auth/oauth2/authorize?")) {
				await prepareAuthorizeClient(requestUrl, nodeRequestHeaders(req));
			}
			return await betterAuthHandler.handle(req, res);
		}

		// 3c0. The super-admin console's RPC (/api/super-admin/*). Before the
		// /api/* OpenAPI catch-all below, which would try to match it as a route.
		if (requestUrl?.startsWith(SUPER_ADMIN_RPC_PREFIX)) {
			const superAdminRpcResult = await superAdminRpcHandler.handle(req, res, {
				context: {},
				prefix: SUPER_ADMIN_RPC_PREFIX,
			});
			if (superAdminRpcResult.matched) return;
		}

		// 3b2. Per-team PWA manifest (/api/tenant/manifest.webmanifest).
		// Plain HTTP (not oRPC): the browser fetches a manifest by URL.
		if (tenantHandler.matches(req)) {
			return await tenantHandler.handle(req, res);
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
		if (requestUrl === "/" || requestUrl === "/health" || requestUrl?.startsWith("/?")) {
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/json");
			res.end(
				JSON.stringify(
					healthBody(
						health,
						{ redis: await getRedisStatus(), httpVersion: req.httpVersion },
						{ development: isDev, service: env.OTEL_SERVICE_NAME, environment: env.NODE_ENV },
					),
				),
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
