import { isProd } from "@backend/configs/env.config";
import { openApiRouter } from "@backend/routers/open_api/open_api.router";
import {
	TRACE_HEADERS_ALLOW,
	TRACE_HEADERS_EXPOSE,
} from "@backend/utils/cors.utils";
import { handleBoundaryError } from "@backend/utils/errorParser";
import { logger } from "@backend/utils/logger.utils";
import { trace } from "@opentelemetry/api";
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { CORSPlugin, RequestHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

export const openApiHandler = new OpenAPIHandler(openApiRouter, {
	plugins: [
		new CORSPlugin({
			origin: "*",
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: [
				"x-team-id",
				"x-api-key",
				"content-type",
				...TRACE_HEADERS_ALLOW,
			],
			exposeHeaders: [...TRACE_HEADERS_EXPOSE],
			credentials: false,
		}),
		new LoggingHandlerPlugin({
			logger,
			logRequestResponse: !isProd,
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
					description: "OpenAPI documentation for the application",
				},
				servers: [{ url: "/api" }],
				components: {
					securitySchemes: {
						sessionCookie: {
							type: "apiKey",
							in: "cookie",
							name: "__Secure-better-auth.session_token",
							description:
								"Better Auth session cookie used by user-authenticated routes.",
						},
						"x-team-id": {
							type: "apiKey",
							in: "header",
							name: "x-team-id",
							description: "Team ID for authentication",
						},
						"x-api-key": {
							type: "apiKey",
							in: "header",
							name: "x-api-key",
							description: "API Key for authentication",
						},
					},
				},
				security: [
					{
						"x-team-id": [],
						"x-api-key": [],
					},
				],
			},
		}),
		new RequestHeadersPlugin(),
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
				throw handleBoundaryError(error, "open_api");
			}
		},
	],
});
