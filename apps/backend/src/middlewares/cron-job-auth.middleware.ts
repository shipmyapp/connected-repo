import { env } from "@backend/configs/env.config";
import type { OpenApiContextWithHeaders } from "@backend/procedures/open_api_public.procedure";
import type { MiddlewareNextFn } from "@orpc/server";
import { ORPCError } from "@orpc/server";

/**
 * Cron Job Authentication Middleware
 * Checks for Authorization header with Bearer token matching CRON_JOB_TOKEN
 */
export const cronJobAuthMiddleware = async ({
	context,
	next,
}: {
	context: OpenApiContextWithHeaders;
	next: MiddlewareNextFn<unknown>;
}) => {
	const reqHeaders = context.reqHeaders;

	// Extract Authorization header
	const authorization = reqHeaders.get("Authorization");

	if (!authorization || typeof authorization !== "string") {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "Missing or invalid Authorization header",
		});
	}

	// Check if it matches Bearer <token>
	const expectedAuth = `Bearer ${env.CRON_JOB_TOKEN}`;
	if (authorization !== expectedAuth) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "Invalid Authorization token",
		});
	}

	return next({ context });
};