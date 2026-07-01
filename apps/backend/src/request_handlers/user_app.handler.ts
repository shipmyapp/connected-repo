import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { isDev, isProd, isStaging } from "@backend/configs/env.config";
import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import {
	TRACE_HEADERS_ALLOW,
	TRACE_HEADERS_EXPOSE,
} from "@backend/utils/cors.utils";
import { handleBoundaryError } from "@backend/utils/errorParser";
import { logger } from "@backend/utils/logger.utils";
import { trace } from "@opentelemetry/api";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { RPCHandler } from "@orpc/server/node";
import {
	CORSPlugin,
	RequestHeadersPlugin,
	ResponseHeadersPlugin,
	SimpleCsrfProtectionHandlerPlugin,
	StrictGetMethodPlugin,
} from "@orpc/server/plugins";

export const reactAppHandler = new RPCHandler(userAppRouter, {
	plugins: [
		new RequestHeadersPlugin(),
		new ResponseHeadersPlugin(),
		new CORSPlugin({
			origin: [...allowedOrigins],
			allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			allowHeaders: [
				"content-type",
				"authorization",
				"x-csrf-token",
				"x-team-id",
				...TRACE_HEADERS_ALLOW,
			],
			exposeHeaders: [...TRACE_HEADERS_EXPOSE],
			credentials: true,
		}),
		new LoggingHandlerPlugin({
			logger,
			logRequestResponse: isDev,
			logRequestAbort: false,
		}),
		// CSRF protection — disabled in dev for easier testing. Bearer-token
		// callers (mobile, server-to-server) are excluded because the token
		// already proves origin.
		...(isProd || isStaging
			? [
					new SimpleCsrfProtectionHandlerPlugin({
						exclude: async ({ context }) => {
							const authHeader = context.reqHeaders
								?.get("authorization")
								?.trim();
							if (authHeader && /^bearer\s+/i.test(authHeader)) {
								return true;
							}
							return false;
						},
					}),
				]
			: []),
		new StrictGetMethodPlugin(),
	],
	interceptors: [
		async ({ request, next }) => {
			const span = trace.getActiveSpan();

			request.signal?.addEventListener("abort", () => {
				span?.addEvent("aborted", { reason: String(request.signal?.reason) });
			});

			try {
				return await next();
			} catch (error) {
				throw handleBoundaryError(error, "user_app");
			}
		},
	],
});
