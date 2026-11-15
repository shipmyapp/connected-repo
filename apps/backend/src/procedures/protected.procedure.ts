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

/**
 * Requires a valid session. Every authenticated call is charged once to
 * `app:user:<id>` (300 per minute, refilling 5 per second): it caps a
 * runaway client or script, not real traffic (the sync engine runs well
 * under it). Redis down: the limit lets calls through.
 */
export const rpcProtectedProcedure = rpcPublicProcedure.use(rpcAuthMiddleware).use(
	createRateLimitMiddleware<RpcAuthenticatedContext>({
		bucketFn: (ctx) => ({
			key: `app:user:${ctx.user.id}`,
			limit: 300,
			windowSeconds: 60,
		}),
		label: "app",
	}),
);

/**
 * Requires a valid session + the client to have explicitly selected an active
 * team via the `x-team-id` header. Looks up the matching team_members row and
 * runs the rest of the handler inside an AsyncLocalStorage scope carrying the
 * tenant identity — base-table `setOnCreate` hooks read this to auto-stamp
 * `teamId` and `createdByTeamMemberId` on every insert.
 * `x-team-id` is checked against the user row when Better Auth's cached
 * cookie copy disagrees (see the comment in the gate).
 *
 * The app:user rate limit is charged by rpcProtectedProcedure, before this gate.
 */
export const rpcProtectedActiveTeamProcedure = rpcProtectedProcedure.use(
	async ({ context, next }) => {
		const headerTeamId = context.reqHeaders.get("x-team-id");
		if (!headerTeamId) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Active team id mismatch.",
			});
		}

		// `context.user` comes out of Better Auth's signed session cookie, a
		// copy of the user row up to five minutes old (`session.cookieCache` in
		// auth.config.ts). `teams.setActiveTeam` and `teams.getDefaultTeam` write
		// `users.activeTeamAppId` behind Better Auth's back, so right after a
		// team switch the copy names the previous team while the client (main
		// thread and DataWorker) already sends the new one. When the two
		// disagree the row decides, with one read that only the stale-cookie
		// window pays for.
		let activeTeamAppId = context.user.activeTeamAppId;
		if (activeTeamAppId !== headerTeamId) {
			const row = await db.users
				.where({ id: context.user.id })
				.select("activeTeamAppId")
				.takeOptional();
			activeTeamAppId = row?.activeTeamAppId ?? null;
		}

		if (!activeTeamAppId) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "User does not have an active team.",
			});
		}

		if (headerTeamId !== activeTeamAppId) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Active team id mismatch.",
			});
		}

		// Before the team request context exists: the scope is lifted, the
		// where names the team.
		const activeMember = await db.teamMembers
			.unscope("default")
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
	},
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
