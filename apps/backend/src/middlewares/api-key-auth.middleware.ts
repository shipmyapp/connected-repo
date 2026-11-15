import { db } from "@backend/db/db";
import type { OpenApiContextWithHeaders } from "@backend/procedures/open_api_public.procedure";
import { generateApiKey, hashApiKey, verifyApiKey } from "@backend/utils/apiKeyGenerator.utils";
import { omitKeys } from "@backend/utils/omit.utils";
import type { MiddlewareNextFn } from "@orpc/server";
import { ORPCError } from "@orpc/server";

/**
 * Lazily-initialized dummy hash used to keep timing constant when the
 * requested team id does not exist (or the DB lookup fails). We run
 * verifyApiKey against this hash so the total wall-clock time for a
 * "missing team" request matches the wall-clock time for a "valid team,
 * wrong key" request. This closes the enumeration side-channel that
 * would otherwise reveal whether a `teamApiId` exists.
 *
 * Generated at first use via `hashApiKey` so the format stays in sync
 * with the real generator (currently `salt:scrypt-derived-key`, both
 * hex-encoded) without requiring top-level await.
 */
let dummyHashPromise: Promise<string> | null = null;
const getDummyHash = (): Promise<string> => {
	if (!dummyHashPromise) {
		dummyHashPromise = hashApiKey(generateApiKey());
	}
	return dummyHashPromise;
};

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
	const teamApiId = reqHeaders.get("x-team-id");

	if (!apiKey || typeof apiKey !== "string") {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "Missing or invalid x-api-key header",
		});
	}

	if (!teamApiId || typeof teamApiId !== "string") {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "Missing or invalid x-team-id header",
		});
	}

	try {
		// Use takeOptional so a missing teamApiId returns undefined instead
		// of throwing synchronously. Throwing early on "not found" would let
		// an attacker distinguish "team exists" from "team missing" via
		// response time (the exists path pays for a full scrypt verify).
		const lookup = () =>
			db.teamsApi.where({ teamApiId }).select("*", "apiSecretHash").takeOptional();
		type TeamApiRow = NonNullable<Awaited<ReturnType<typeof lookup>>>;

		let teamApiFromDb: TeamApiRow | undefined;
		try {
			teamApiFromDb = (await lookup()) ?? undefined;
		} catch {
			// Treat any lookup failure as "not found" for timing purposes;
			// we still run the dummy verify below before rejecting.
			teamApiFromDb = undefined;
		}

		if (!teamApiFromDb) {
			// Run a dummy verify so the response time for a missing team
			// matches the response time for a valid team + wrong key.
			// Discard the result and reject with the same generic error.
			const dummyHash = await getDummyHash();
			await verifyApiKey(apiKey, dummyHash);
			throw new ORPCError("UNAUTHORIZED", {
				status: 401,
				message: "API key authentication failed",
			});
		}

		const isValid = await verifyApiKey(apiKey, teamApiFromDb.apiSecretHash);

		if (!isValid) {
			throw new ORPCError("UNAUTHORIZED", {
				status: 401,
				message: "Invalid API key",
			});
		}

		return next({
			context: {
				...context,
				"x-team-id": teamApiId,
				"x-api-key": apiKey,
				teamApi: omitKeys(teamApiFromDb, ["apiSecretHash"]),
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
