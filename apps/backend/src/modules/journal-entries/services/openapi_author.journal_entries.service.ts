import { db } from "@backend/db/db";
import type { RequestContext } from "@backend/lib/request-context";
import { ORPCError } from "@orpc/server";

/**
 * The team context an API key writes in: the live membership it is
 * configured to write as. Refuses when none is configured, or when that
 * member has left or has no account.
 */
export const resolveApiWriter = async (teamApiId: string): Promise<RequestContext> => {
	const key = await db.teamsApi.find(teamApiId).select("writesAsTeamMemberId");
	const member = key.writesAsTeamMemberId
		? await db.teamMembers
				.unscope("default")
				.where({ id: key.writesAsTeamMemberId })
				.select("id", "teamId", "userId", "role")
				.takeOptional()
		: undefined;
	if (!member?.userId) {
		throw new ORPCError("FORBIDDEN", {
			status: 403,
			message: "This API key has no team member to write as.",
		});
	}
	return {
		tenantTeamId: member.teamId,
		userId: member.userId,
		teamMemberId: member.id,
		teamMemberRole: member.role,
	};
};
