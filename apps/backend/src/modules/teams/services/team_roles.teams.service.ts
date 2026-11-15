import { db } from "@backend/db/db";
import { ORPCError } from "@orpc/server";

/**
 * Refuses a change that would leave `teamId` without an Owner who has an
 * account: the member `memberId` leaving, being removed, or stepping down
 * from Owner. Does nothing when that member is not such an Owner. Names its
 * team, so it works inside or outside a team request.
 */
export const assertNotLastOwner = async (teamId: string, memberId: string): Promise<void> => {
	const member = await db.teamMembers
		.unscope("default")
		.where({ id: memberId, teamId })
		.select("role", "userId")
		.takeOptional();
	if (!member || member.role !== "Owner" || member.userId === null) return;
	const owners = await db.teamMembers
		.unscope("default")
		.where({ teamId, role: "Owner" })
		.whereNot({ userId: null })
		.count();
	if (owners <= 1) {
		throw new ORPCError("CONFLICT", {
			status: 409,
			message:
				"A team needs at least one Owner. Make someone else an Owner first, or delete the team.",
		});
	}
};

/** The id of the account a team is the personal team of, or null for a shared team. */
export const personalOwnerOf = async (teamId: string): Promise<string | null> => {
	const team = await db.teamsApp.find(teamId).select("personalTeamForUserId");
	return team.personalTeamForUserId;
};
