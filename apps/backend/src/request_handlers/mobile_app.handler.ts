import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import { isDev, isProd, isStaging } from "@backend/configs/env.config";
import { logger } from "@backend/utils/logger.utils";
import { trace } from '@opentelemetry/api';
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { CORSPlugin, RequestHeadersPlugin, SimpleCsrfProtectionHandlerPlugin, StrictGetMethodPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

export const mobileAppHandler = new OpenAPIHandler(userAppRouter, {
	plugins: [
		new CORSPlugin({
			origin: '*', // or env.API_ALLOWED_ORIGINS if you want restrictions
			allowMethods: ['GET', 'POST', 'OPTIONS'],
			allowHeaders: ['content-type', 'authorization', 'x-team-id', 'x-csrf-token', 'sentry-trace', 'baggage'],
            // Needed for flutter web
			credentials: false, // No cookies/credentials needed for API key auth
		}),
		new LoggingHandlerPlugin({
			logger,
			logRequestResponse: isDev, // Only log in dev/staging
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
                        // Needed for flutter web
						sessionCookie: {
							type: "apiKey",
							in: "cookie",
							name: "__Secure-better-auth.session_token",
							description: "Better Auth session cookie used by user-authenticated routes.",
						},
						"x-team-id": {
							type: "apiKey",
							in: "header",
							name: "x-team-id",
							description: "Team ID for authentication",
						},
					},
				},
				security: [
					{
						"x-team-id": [],
					},
				],
			},
		}),
		new RequestHeadersPlugin(),
        // CSRF protection (disabled in development for easier testing)
        ...(isProd || isStaging
        ? [
            new SimpleCsrfProtectionHandlerPlugin({
                exclude: async ({ context }) => {
                // Exclude requests using VALID Bearer tokens (typically from mobile apps)
                const authHeader = context.reqHeaders?.get('authorization')?.trim();
                if (authHeader && /^bearer\s+/i.test(authHeader)) {
                    try {
                    // his calls auth.api.getSession on every request with a Bearer token. This introduces excessive latency or DB load, as Better Auth might fetch the session again in its own middleware.
                    // const session = await auth.api.getSession({
                    //   headers: context.reqHeaders,
                    // });
                    // return !!session;
                    return true;
                    } catch (e) {
                    return false;
                    }
                }
                return false;
                },
            }),
            ]
        : []),
        // Strict GET method plugin (queries must use GET)
        new StrictGetMethodPlugin(),
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
            // Commented as leads to double logging.
        // onError((error) => {
        //   const parsed = orpcErrorParser(error as Error);
        //   throw new ORPCError(parsed.code, {
        //     status: parsed.httpStatus,
        //     message: parsed.userFriendlyMessage,
        //     data: parsed.details,
        //     cause: error,
        //   });
        // }),
    ],
})