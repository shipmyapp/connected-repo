import { apiKeyAuthMiddleware } from "@backend/middlewares/api-key-auth.middleware";
import { ipWhitelistMiddleware } from "@backend/middlewares/ip_whitelist.middleware";
import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import {
	type OpenApiContext,
	type OpenApiContextWithHeaders,
	openApiPublicProcedure,
} from "@backend/procedures/open_api_public.procedure";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import type { TeamApiSelectAll } from "@connected-repo/zod-schemas/team_api.zod";

export interface OpenApiAuthContext extends OpenApiContextWithHeaders {
	"x-team-id": string;
	"x-api-key": string;
	teamApi: TeamApiSelectAll;
}
// API authenticated procedure — API-key auth, IP whitelist, and per-key
// rate limiting driven by the team's configured `rateLimitPerMinute`.
// A row with `rateLimitPerMinute <= 0` disables the limit for that key.
export const openApiAuthProcedure = openApiPublicProcedure
	// Before the key check: its scrypt verify costs CPU and memory, also for
	// an unknown team id (on purpose, for constant timing). An anonymous flood
	// must not buy that.
	.use(
		createRateLimitMiddleware<OpenApiContextWithHeaders>({
			bucketFn: (ctx) => ({
				key: `openapi:ip:${getClientIpAddress(ctx.reqHeaders)}`,
				limit: 120,
				windowSeconds: 60,
			}),
			label: "openapi-ip",
		}),
	)
	.use(apiKeyAuthMiddleware)
	.use(ipWhitelistMiddleware)
	.use(
		createRateLimitMiddleware<OpenApiAuthContext>({
			bucketFn: (ctx) => {
				const perMinute = ctx.teamApi.rateLimitPerMinute;
				if (perMinute <= 0) return null;
				return {
					key: `openapi:teamApi:${ctx.teamApi.teamApiId}`,
					limit: perMinute,
					windowSeconds: 60,
				};
			},
			label: "openapi",
		}),
	);

/**
 * @public
 */
export type ApiAuthContext = OpenApiContext;
