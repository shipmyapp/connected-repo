import { db } from "@backend/db/db";
import type { RpcAuthenticatedContext } from "@backend/procedures/protected.procedure";
import { RECENT_SIGN_IN_MINUTES } from "@connected-repo/zod-schemas/account.zod";
import { type MiddlewareNextFn, ORPCError } from "@orpc/server";

const RECENT_SIGN_IN_MS = RECENT_SIGN_IN_MINUTES * 60 * 1000;

/**
 * A sensitive act needs a session opened in the last RECENT_SIGN_IN_MINUTES.
 * Sign-in is Google or Apple (no password), so "prove it is you" means signing
 * in again with the provider; the client does that on REAUTH_REQUIRED and
 * comes back. Reads the session ROW, not Better Auth's five-minute cookie
 * copy, so a session ended on another device cannot pass here either. A
 * connected app's stand-in session has no row: it never passes.
 */
export const rpcRecentSignInMiddleware = async ({
	context,
	next,
}: {
	context: RpcAuthenticatedContext;
	next: MiddlewareNextFn<unknown>;
}) => {
	const row = await db.sessions
		.where({ id: context.session.id })
		.select("createdAt")
		.takeOptional();
	if (!row) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "This session has ended. Sign in again.",
		});
	}
	if (Date.now() - row.createdAt > RECENT_SIGN_IN_MS) {
		const providers = await db.accounts.where({ userId: context.user.id }).pluck("providerId");
		throw new ORPCError("REAUTH_REQUIRED", {
			status: 403,
			message: "For your safety, sign in again to confirm this.",
			data: { providers: [...new Set(providers)] },
		});
	}
	return next({ context });
};
