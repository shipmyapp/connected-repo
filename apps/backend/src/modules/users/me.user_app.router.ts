import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { userWithTeamsZod } from "@connected-repo/zod-schemas/user.zod";

const profile = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Me"] })
	.output(userWithTeamsZod)
	.handler(
		async ({
			context: {
				user: { id: userId },
			},
		}) => {
			const profile = await db.users
				.select("*", {
					teams: (t) => t.teams.selectAll(),
				})
				.find(userId);

			return profile;
		},
	);

export const meRouter = {
	profile,
};
