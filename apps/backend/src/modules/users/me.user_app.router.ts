import { db } from "@backend/db/db";
import { asksOf, recordAsk } from "@backend/modules/users/services/asks.users.service";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { asksZod, recordAskInputZod } from "@connected-repo/zod-schemas/device.zod";
import { userWithTeamsZod } from "@connected-repo/zod-schemas/user.zod";
import { z } from "zod";

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

/** The person's answers to the device asks (read once a visit by the asks store). */
const asks = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Me"] })
	.output(asksZod)
	.handler(async ({ context: { user } }) => asksOf(user.id));

/** An answer to a device ask: Not now, granted, refused in the browser, waiting for the install. */
const recordAskProcedure = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Me"] })
	.input(recordAskInputZod)
	.output(z.object({ asks: asksZod }))
	.handler(async ({ input, context: { user } }) => ({ asks: await recordAsk(user.id, input) }));

export const meRouter = { asks, profile, recordAsk: recordAskProcedure };
