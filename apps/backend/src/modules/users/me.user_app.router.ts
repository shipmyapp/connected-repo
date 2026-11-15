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
			// Not a team request: the `team_members` tenant scope is lifted and
			// the where names the caller. The `team` relation keeps the
			// soft-delete filter, so a deleted team drops out.
			const profile = await db.users.find(userId);
			const memberships = await db.teamMembers
				.unscope("default")
				.where({ userId })
				.select({ team: (q) => q.team.selectAll() });

			return {
				...profile,
				// Postgres returns `time` as HH:mm:ss; the contract is HH:mm.
				journalReminderTimes: profile.journalReminderTimes.map((t) => t.slice(0, 5)),
				teams: memberships.flatMap((m) => (m.team ? [m.team] : [])),
			};
		},
	);

export const meRouter = {
	profile,
};
