import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
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
 * Middleware order matters: auth (from protected) -> session-security-strict
 * -> rate-limit. The session-security log runs first, then rate-limit before
 * we spend CPU on input validation.
 */
export const rpcSensitiveProcedure = rpcProtectedProcedure
	.use(rpcSessionSecurityMiddleware("strict"))
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
