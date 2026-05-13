import { db } from "@backend/db/db";
import { TeamAppCreateInput } from "@connected-repo/zod-schemas/team_app.zod";

export const createTeamService = async (
	userId: string,
	userEmail: string | null,
	userPhoneNumber: string | null,
	input: TeamAppCreateInput,
) => {
	return await db.teamsApp.create({
		...input,
		createdByUserId: userId,
		members: {
			create: [
				{
					userId,
					email: userEmail,
					phoneNumber: userPhoneNumber,
					role: "Owner",
					joinedAt: Date.now(),
				},
			],
		},
	});
};

