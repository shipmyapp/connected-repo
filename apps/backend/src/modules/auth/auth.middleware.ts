import { OAUTH_TOKEN_PREFIX } from "@backend/modules/user_mcp/oauth.user_mcp.config";
import type { RpcContextWithHeaders } from "@backend/procedures/public.procedure";
import { transformSessionAndUserData } from "@backend/utils/session.utils";
import { type MiddlewareNextFn, ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/node";
import { auth } from "./auth.config";
import { isSessionRevoked } from "./services/revoked_sessions.auth.service";

export const rpcAuthMiddleware = async ({
	context,
	next,
}: {
	context: RpcContextWithHeaders;
	next: MiddlewareNextFn<unknown>;
}) => {
	// 1. A connected app's call (ADR-045): the /mcp handler verified the OAuth
	// access token and resolved the person, then called this procedure through
	// its in-process router client. `connectedApp` is never read from a
	// request (every HTTP handler passes `context: {}`).
	if (context.connectedApp && context.session && context.user) {
		return next({
			context: { ...context, session: context.session, user: context.user },
		});
	}

	const reqHeaders = context.reqHeaders;

	// 2. An OAuth access token is for /mcp only. The bearer plugin would try it
	// as a session token and find nothing, but refuse it explicitly so a
	// connected app can never stand in for a session on the oRPC routes.
	const bearer = (reqHeaders.get("authorization") ?? "").trim().replace(/^bearer\s+/i, "");
	if (bearer.startsWith(OAUTH_TOKEN_PREFIX.opaqueAccessToken)) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "OAuth access tokens are accepted on /mcp only.",
		});
	}

	// 3. Cookie session (web) or Better Auth bearer session token (mobile,
	// bearer plugin).
	const sessionData = await auth.api.getSession({
		headers: reqHeaders,
	});

	if (!sessionData?.session.id || !sessionData?.user.id) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "User is not authenticated",
		});
	}

	// A session ended elsewhere stays in the signed cookie cache for up to five
	// minutes; the revocation mark closes that window (one Redis EXISTS).
	if (await isSessionRevoked(sessionData.session.id)) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "User is not authenticated",
		});
	}

	const { session, user } = transformSessionAndUserData(sessionData);

	// The account's id only: email, phone number and name went with every
	// Sentry event. The super-admin console finds the
	// person from the id.
	Sentry.setUser({ id: user.id });

	// Team memberships are loaded LAZILY inside `rpcProtectedActiveTeamProcedure`
	// for the one active team. Eager-loading every membership here scaled poorly
	// with users in many teams and most endpoints never used it.
	return next({
		context: {
			...context,
			session,
			user,
		},
	});
};
