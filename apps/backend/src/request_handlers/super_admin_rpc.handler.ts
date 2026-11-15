import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { isDev, isProd, isStaging } from "@backend/configs/env.config";
import { superAdminRouter } from "@backend/routers/super_admin/super_admin.router";
import { DEFAULT_BODY_LIMIT_BYTES } from "@backend/utils/body_limit.utils";
import { TRACE_HEADERS_ALLOW, TRACE_HEADERS_EXPOSE } from "@backend/utils/cors.utils";
import { handleBoundaryError } from "@backend/utils/errorParser";
import { logger } from "@backend/utils/logger.utils";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/node";
import {
	CORSPlugin,
	RequestHeadersPlugin,
	ResponseHeadersPlugin,
	SimpleCsrfProtectionHandlerPlugin,
	StrictGetMethodPlugin,
} from "@orpc/server/plugins";

/**
 * The super-admin router over oRPC's RPC protocol, for the typed client of
 * `apps/superadmin`. Under `/api/` so the console's proxy forwards one
 * prefix family, as the frontend's does. The OpenAPI handler at
 * `/super-admin` stays for the docs. Same router, same gate: the procedure's
 * allowlist decides every call.
 */
export const SUPER_ADMIN_RPC_PREFIX = "/api/super-admin" as const;

export const superAdminRpcHandler = new RPCHandler(superAdminRouter, {
	plugins: [
		new BodyLimitPlugin({ maxBodySize: DEFAULT_BODY_LIMIT_BYTES }),
		new RequestHeadersPlugin(),
		new ResponseHeadersPlugin(),
		new CORSPlugin({
			origin: [...allowedOrigins],
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["content-type", "x-csrf-token", ...TRACE_HEADERS_ALLOW],
			exposeHeaders: [...TRACE_HEADERS_EXPOSE],
			credentials: true,
		}),
		new LoggingHandlerPlugin({
			logger,
			logRequestResponse: isDev,
			logRequestAbort: false,
		}),
		// Cookies only (no bearer exception): a cross-site form cannot send the
		// header the console's link adds, and a cross-origin fetch that does
		// needs a preflight only ALLOWED_ORIGINS pass. Off in dev/test as in
		// the user app's handler.
		...(isProd || isStaging ? [new SimpleCsrfProtectionHandlerPlugin()] : []),
		new StrictGetMethodPlugin(),
	],
	interceptors: [
		async ({ next }) => {
			try {
				return await next();
			} catch (error) {
				throw handleBoundaryError(error, "super_admin_rpc");
			}
		},
	],
});
