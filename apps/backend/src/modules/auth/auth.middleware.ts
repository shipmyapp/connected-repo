import type { RpcContextWithHeaders } from "@backend/procedures/public.procedure";
import { transformSessionAndUserData } from "@backend/utils/session.utils";
import { type MiddlewareNextFn, ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/node";
import { auth } from "./auth.config";

export const rpcAuthMiddleware = async ({
	context,
	next,
}: {
	context: RpcContextWithHeaders;
	next: MiddlewareNextFn<unknown>;
}) => {
	const reqHeaders = context.reqHeaders;

	const sessionData = await auth.api.getSession({
		headers: reqHeaders,
	});

	if (!sessionData?.session.id || !sessionData?.user.id) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "User is not authenticated",
		});
	}

	const { session, user } = transformSessionAndUserData(sessionData);

	// Set user context in Sentry for this request.
	Sentry.setUser({
		id: user.id,
		email: user.email ?? undefined,
		phoneNumber: user.phoneNumber ?? undefined,
		username: user.name,
	});

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
