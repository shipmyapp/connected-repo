import { isProd } from "@backend/configs/env.config";
import { openApiRouter } from "@backend/routers/open_api/open_api.router";
import { orpcErrorParser } from "@backend/utils/errorParser";
import { logger } from "@backend/utils/logger.utils";
import { trace } from '@opentelemetry/api';
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { CORSPlugin, RequestHeadersPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

export const openApiHandler = new OpenAPIHandler(openApiRouter, {
	plugins: [
		new CORSPlugin({
			origin: '*', // or env.API_ALLOWED_ORIGINS if you want restrictions
			allowMethods: ['GET', 'POST', 'OPTIONS'],
			allowHeaders: ["x-team-id", "x-api-key", "content-type"],
			credentials: false, // No cookies/credentials needed for API key auth
		}),
		new LoggingHandlerPlugin({
      logger,
      logRequestResponse: !isProd, // Only log in dev/staging
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
		({ request, next }) => {
			const span = trace.getActiveSpan()

			request.signal?.addEventListener('abort', () => {
				span?.addEvent('aborted', { reason: String(request.signal?.reason) })
			})

			return next()
		},
		// Server-side error logging
		onError((error) => {
			logger.error(error, "OpenAPI error");
		}),
	],
  clientInterceptors: [
    // Client-side error transformation
    onError((error) => {
      const parsed = orpcErrorParser(error as Error);
      throw new ORPCError(parsed.code, {
        status: parsed.httpStatus,
        message: parsed.userFriendlyMessage,
        data: parsed.details,
        cause: error,
      });
    }),
  ],
});
