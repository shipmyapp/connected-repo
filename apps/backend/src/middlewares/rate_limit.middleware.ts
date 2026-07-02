import { checkAndRecordRateLimit } from "@backend/modules/system/services/rate_limit.service";
import { logger } from "@backend/utils/logger.utils";
import type { MiddlewareNextFn } from "@orpc/server";
import { ORPCError } from "@orpc/server";

export interface RateLimitBucket {
	/**
	 * Sliding-window bucket key. Convention: prefix with the caller type —
	 * `openapi:teamApi:${id}`, `sensitive:user:${id}`, `login:ip:${addr}` —
	 * so keyspaces from different middleware instances can't collide.
	 */
	key: string;
	/** Max hits inside `windowSeconds`. */
	limit: number;
	/** Sliding-window size, in seconds. */
	windowSeconds: number;
}

export interface RateLimitOptions<Ctx> {
	/**
	 * Derive the bucket from the request context. Return `null` to skip
	 * rate-limiting for this request entirely (e.g. rateLimit disabled
	 * for this API key, or an unauthenticated probe that shouldn't count
	 * against any tenant's budget).
	 *
	 * Returning the full bucket per-request — rather than at middleware
	 * construction — lets `limit` and `windowSeconds` come from a
	 * per-tenant config field (`teamApi.rateLimitPerMinute`) without
	 * needing one middleware instance per limit value.
	 */
	bucketFn: (context: Ctx) => RateLimitBucket | null;
	/**
	 * Optional label shown in the 429 message and log line. Only used for
	 * diagnostics — the enforcement key is `bucketFn`'s output.
	 */
	label?: string;
}

/**
 * Compose a rate-limit middleware onto any oRPC procedure.
 *
 * Usage:
 *   const heavyProcedure = rpcProtectedProcedure.use(
 *     createRateLimitMiddleware<RpcContext>({
 *       bucketFn: (ctx) => ({
 *         key: `sensitive:user:${ctx.user.id}`,
 *         limit: 5,
 *         windowSeconds: 60,
 *       }),
 *       label: "sensitive-op",
 *     }),
 *   );
 *
 * Bucket key naming convention — MUST use `<scope>:<subject>:<id>` so
 * different middleware call sites never collide on the same row:
 *   - `openapi:teamApi:<teamApiId>`        — per API key (open-api procedures)
 *   - `sensitive:user:<userId>`            — per user, sensitive/destructive ops
 *   - `super-admin:user:<userId>`          — per super-admin, admin actions
 *   - `app:user:<userId>`                  — per user, general app procedures
 *   - `login:ip:<addr>`                    — per source IP, pre-auth surfaces
 *
 * Expected callers (who mounts this middleware):
 *   - `openApiAuthProcedure` — team-API tenants
 *   - `rpcSensitiveProcedure` — session-security-strict user actions
 *   - `rpcSuperAdminProcedure` — env-allowlisted operators
 *   - `rpcProtectedActiveTeamProcedure` — general app traffic (per-user cap)
 *
 * The middleware is generic in the context so it composes with any
 * upstream procedure (public / protected / api-key).
 *
 * Placement inside a procedure chain: mount this AFTER auth middleware
 * (so we know the identity we're bucketing) but BEFORE expensive input
 * validation or DB reads (so rejected requests spend near-zero CPU).
 *
 * Storage impl is swappable — `checkAndRecordRateLimit` is a Postgres
 * token-bucket today; switching to Redis is a service-file change with
 * zero call-site churn.
 */
// biome-ignore lint/suspicious/noExplicitAny: matches oRPC's Context = Record<PropertyKey, any> constraint. Narrower types like `unknown` reject interface types without index signatures (e.g. OpenApiAuthContext).
export const createRateLimitMiddleware = <Ctx extends Record<PropertyKey, any>>(
	opts: RateLimitOptions<Ctx>,
) => {
	return async ({
		context,
		next,
	}: {
		context: Ctx;
		next: MiddlewareNextFn<unknown>;
	}) => {
		const bucket = opts.bucketFn(context);
		if (!bucket) return next({ context });

		const result = await checkAndRecordRateLimit(
			bucket.key,
			bucket.limit,
			bucket.windowSeconds,
		);

		if (!result.allowed) {
			logger.warn(
				{
					key: bucket.key,
					limit: bucket.limit,
					windowSeconds: bucket.windowSeconds,
					label: opts.label,
					retryAfterSeconds: result.retryAfterSeconds,
				},
				"[rateLimit] rejected",
			);
			throw new ORPCError("TOO_MANY_REQUESTS", {
				status: 429,
				message: `Rate limit exceeded${opts.label ? ` (${opts.label})` : ""}. Retry after ${result.retryAfterSeconds}s.`,
				data: { retryAfterSeconds: result.retryAfterSeconds },
			});
		}

		return next({ context });
	};
};
