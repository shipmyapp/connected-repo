import { db } from "@backend/db/db";
import type { OpenApiContextWithHeaders } from "@backend/procedures/open_api_public.procedure";
import { verifyApiKey } from "@backend/utils/apiKeyGenerator.utils";
import { omitKeys } from "@backend/utils/omit.utils";
import type { MiddlewareNextFn } from "@orpc/server";
import { ORPCError } from "@orpc/server";

/**
 * API Key Authentication Middleware
 * Extracts x-api-key and x-team-user-reference-id headers, verifies API key against team's hash
 * and attaches team data to context if valid
 */
export const apiKeyAuthMiddleware = async ({
	context,
	next,
}: {
	context: OpenApiContextWithHeaders;
	next: MiddlewareNextFn<unknown>;
}) => {
	const reqHeaders = context.reqHeaders;

	// Extract headers
	const apiKey = reqHeaders.get("x-api-key");
	const teamId = reqHeaders.get("x-team-id");

	if (!apiKey || typeof apiKey !== "string") {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "Missing or invalid x-api-key header",
		});
	}

	if (!teamId || typeof teamId !== "string") {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "Missing or invalid x-team-id header",
		});
	}

	try {
		// We need to fetch all teams and verify API key against each hash
		// since we can't query by the hash directly
		const team = await db.teams.find(teamId).select("*", "apiSecretHash");
		
		const isValid = await verifyApiKey(apiKey, team.apiSecretHash);

		if (!isValid) {
			throw new ORPCError("UNAUTHORIZED", {
				status: 401,
				message: "Invalid API key",
			});
		}

		return next({
			context: {
				...context,
				"x-team-id": teamId,
				"x-api-key": apiKey,
				team: omitKeys(team, ["apiSecretHash"])
			},
		});
	} catch (error) {
		// If it's already an ORPCError, re-throw it
		if (error instanceof ORPCError) {
			throw error;
		}

		// For database or other errors, throw unauthorized
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "API key authentication failed",
		});
	}
};
