import { db } from "@backend/db/db";
import { requestContext } from "@backend/lib/request-context";
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
 */
export const rpcProtectedActiveTeamProcedure = rpcProtectedProcedure.use(
	async ({ context, next }) => {
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
