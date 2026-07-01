import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import { isDev } from "@backend/configs/env.config";
import { superAdminRouter } from "@backend/routers/super_admin/super_admin.router";
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

// Separate handler for super-admin endpoints so the admin surface is
// independently routable and documented. Gate is enforced at the procedure
// layer — see `procedures/super_admin.procedure.ts`.
export const superAdminHandler = new OpenAPIHandler(superAdminRouter, {
	plugins: [
		new CORSPlugin({
			origin: [...allowedOrigins],
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: [
				"content-type",
				"authorization",
				"x-csrf-token",
				...TRACE_HEADERS_ALLOW,
			],
			exposeHeaders: [...TRACE_HEADERS_EXPOSE],
			credentials: true,
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
					title: "Super Admin API",
					version: "1.0.0",
					description:
						"Admin-only endpoints gated by SUPER_ADMIN_EMAILS / SUPER_ADMIN_PHONE_NUMBERS.",
				},
				servers: [{ url: "/super-admin" }],
				components: {
					securitySchemes: {
						sessionCookie: {
							type: "apiKey",
							in: "cookie",
							name: "__Secure-better-auth.session_token",
							description: "Better Auth session cookie of a super-admin user.",
						},
					},
				},
				security: [{ sessionCookie: [] }],
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
				throw handleBoundaryError(error, "super_admin");
			}
		},
	],
});
