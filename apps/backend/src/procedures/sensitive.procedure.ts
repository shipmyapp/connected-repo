import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import { rpcRecentSignInMiddleware } from "@backend/middlewares/recent_sign_in.middleware";
import { rpcSessionSecurityMiddleware } from "@backend/middlewares/session-security.middleware";
import {
	type RpcAuthenticatedContext,
	rpcProtectedProcedure,
} from "@backend/procedures/protected.procedure";

/**
 * Session-security-strict user actions (account deletion, data export). Rate
 * limit is aggressive — a legitimate user hits these at most a handful of
 * times per hour, so 10/min per user leaves ample headroom while stopping
 * credential-stuffing-style enumeration cold.
 *
 * Middleware order: auth (from protected) -> session-security (logs an
 * address change, never refuses) -> recent sign-in (one session-row read) ->
 * rate-limit.
 */
export const rpcSensitiveProcedure = rpcProtectedProcedure
	.use(rpcSessionSecurityMiddleware("strict"))
	.use(rpcRecentSignInMiddleware)
	.use(
		createRateLimitMiddleware<RpcAuthenticatedContext>({
			bucketFn: (ctx) => ({
				key: `sensitive:user:${ctx.user.id}`,
				limit: 10,
				windowSeconds: 60,
			}),
			label: "sensitive",
		}),
	);
