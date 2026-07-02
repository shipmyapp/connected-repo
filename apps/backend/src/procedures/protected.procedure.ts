import { db } from "@backend/db/db";
import { requestContext } from "@backend/lib/request-context";
import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import { rpcAuthMiddleware } from "@backend/modules/auth/auth.middleware";
import type { ActiveSessionSelectAll } from "@backend/modules/auth/tables/session.auth.table";
import {
	type RpcContextWithHeaders,
	rpcPublicProcedure,
} from "@backend/procedures/public.procedure";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";
import { ORPCError } from "@orpc/server";

/**
 * @public
 */
export interface RpcAuthenticatedContext extends RpcContextWithHeaders {
	session: ActiveSessionSelectAll;
	user: UserSelectAll;
}

export interface RpcActiveTeamContext extends RpcAuthenticatedContext {
	user: Omit<UserSelectAll, "activeTeamAppId"> & { activeTeamAppId: string };
	activeTeamId: string;
	activeTeamMemberId: string;
	activeTeamMemberRole: TeamMemberRole;
}

/** Requires a valid session. */
export const rpcProtectedProcedure = rpcPublicProcedure.use(rpcAuthMiddleware);

/**
 * Requires a valid session + the client to have explicitly selected an active
 * team via the `x-team-id` header. Looks up the matching team_members row and
 * runs the rest of the handler inside an AsyncLocalStorage scope carrying the
 * tenant identity — base-table `setOnCreate` hooks read this to auto-stamp
 * `teamId` and `createdByTeamMemberId` on every insert.
 *
 * Rate limit: 300 requests/min per authenticated user (5 req/sec sustained,
 * with a full-bucket burst up to 300). This is the highest-volume procedure
 * in the app, so the budget is deliberately generous — a normal interactive
 * session runs well under 1 req/sec even during sync bursts. The purpose is
 * to cap runaway clients (infinite-loop bugs, malicious scripts), not to
 * throttle real traffic.
 *
 * Cost per accepted request: one SELECT + one UPDATE against `rate_limits`.
 * Rows are keyed by userId so there's exactly one row per active user, kept
 * hot in the Postgres buffer cache — an extra ~1ms per RPC under normal load.
 * The rate-limit gate runs BEFORE the handler's own DB reads and BEFORE input
 * validation, so a throttled request never touches the domain tables.
 *
 * Placement rationale: the rate-limit middleware is chained after the
 * team-membership gate. A user hitting the wrong team gets a 403 without
 * costing their rate-limit budget; a legitimate user is bucketed once they
 * pass the identity checks.
 */
export const rpcProtectedActiveTeamProcedure = rpcProtectedProcedure
	.use(async ({ context, next }) => {
		const activeTeamAppId = context.user.activeTeamAppId;

		if (!activeTeamAppId) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "User does not have an active team.",
			});
		}

		if (
			!context.reqHeaders.has("x-team-id") ||
			context.reqHeaders.get("x-team-id") !== activeTeamAppId
		) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Active team id mismatch.",
			});
		}

		const activeMember = await db.teamMembers
			.where({
				teamId: activeTeamAppId,
				userId: context.user.id,
			})
			.takeOptional();

		if (!activeMember) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Not a member of this team.",
			});
		}

		return requestContext.run(
			{
				tenantTeamId: activeTeamAppId,
				userId: context.user.id,
				teamMemberId: activeMember.id,
				teamMemberRole: activeMember.role,
			},
			() =>
				next({
					context: {
						...context,
						user: { ...context.user, activeTeamAppId },
						activeTeamId: activeTeamAppId,
						activeTeamMemberId: activeMember.id,
						activeTeamMemberRole: activeMember.role,
					},
				}),
		);
	})
	.use(
		createRateLimitMiddleware<RpcActiveTeamContext>({
			bucketFn: (ctx) => ({
				key: `app:user:${ctx.user.id}`,
				limit: 300,
				windowSeconds: 60,
			}),
			label: "app",
		}),
	);

/** Active team + Owner/Admin role gate. */
export const rpcTeamOwnerAdminProcedure = rpcProtectedActiveTeamProcedure.use(
	({ context, next }) => {
		const role = context.activeTeamMemberRole;
		if (role !== "Owner" && role !== "Admin") {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Only Owner or Admin can perform this action",
			});
		}
		return next({ context });
	},
);
