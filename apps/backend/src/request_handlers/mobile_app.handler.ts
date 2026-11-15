import { isDev, isProd, isStaging } from "@backend/configs/env.config";
import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import { isBearerOnlyRequest } from "@backend/utils/bearer.utils";
import { APP_BODY_LIMIT_BYTES } from "@backend/utils/body_limit.utils";
import { TRACE_HEADERS_ALLOW, TRACE_HEADERS_EXPOSE } from "@backend/utils/cors.utils";
import { handleBoundaryError } from "@backend/utils/errorParser";
import { logger } from "@backend/utils/logger.utils";
import { trace } from "@opentelemetry/api";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { BodyLimitPlugin } from "@orpc/server/node";
import {
	CORSPlugin,
	RequestHeadersPlugin,
	SimpleCsrfProtectionHandlerPlugin,
	StrictGetMethodPlugin,
} from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

// Mobile app exposes the same router as the React app over OpenAPI / HTTP-JSON.
// Per ADR-K4 there is intentionally no separate `mobileAppRouter` — the surface
// stays identical until the apps need to diverge.
export const mobileAppHandler = new OpenAPIHandler(userAppRouter, {
	plugins: [
		new BodyLimitPlugin({ maxBodySize: APP_BODY_LIMIT_BYTES }),
		new CORSPlugin({
			origin: "*",
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: [
				"content-type",
				"authorization",
				"x-csrf-token",
				"x-team-id",
				...TRACE_HEADERS_ALLOW,
			],
			exposeHeaders: [...TRACE_HEADERS_EXPOSE],
			credentials: false,
		}),
		new LoggingHandlerPlugin({
			logger,
			logRequestResponse: isDev,
			logRequestAbort: true,
		}),
		new OpenAPIReferencePlugin({
			docsProvider: "scalar",
			docsPath: "/",
			specPath: "/spec.json",
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: {
				info: {
					title: "API Documentation",
					version: "1.0.0",
					description: "OpenAPI documentation for the mobile app",
				},
				servers: [{ url: "/mobile-app" }],
				components: {
					securitySchemes: {
						sessionCookie: {
							type: "apiKey",
							in: "cookie",
							name: "__Secure-better-auth.session_token",
							description: "Better Auth session cookie used by user-authenticated routes.",
						},
					},
				},
				security: [],
			},
		}),
		new RequestHeadersPlugin(),
		...(isProd || isStaging
			? [
					new SimpleCsrfProtectionHandlerPlugin({
						exclude: async ({ context }) => isBearerOnlyRequest(context.reqHeaders),
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
				throw handleBoundaryError(error, "mobile_app");
			}
		},
	],
});
