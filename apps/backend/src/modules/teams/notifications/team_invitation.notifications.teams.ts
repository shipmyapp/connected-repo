import { createHash } from "node:crypto";
import { db } from "@backend/db/db";
import { queueNotification } from "@backend/modules/notifications/services/dispatch.notifications.service";
import { checkAndRecordRateLimit } from "@backend/modules/system/services/rate_limit.service";
import { teamAppIdentity } from "@backend/modules/teams/services/branding.teams.service";
import { logger } from "@backend/utils/logger.utils";
import { emailSubscriberId } from "@backend/utils/notifications.utils";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";

/** Invitation emails one address may receive per day, across every team. */
const INVITES_PER_ADDRESS_PER_DAY = 5;

/** The Redis key for an address: a hash, so no address is stored in Redis. */
const addressKey = (email: string) =>
	`invite:to:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;

/**
 * Emails someone an Owner/Admin added to a team by email
 * (`teams.addTeamMember`, Novu workflow `team-invitation`). Nobody is
 * joined at once: opening the app with that address (signing in with Google
 * or Apple, or just opening it if already signed in) claims the membership
 * (`teams.getMyTeams`), so the copy says "open the app to join" in every
 * case. A team with its own host is opened there, under its own app name
 * (`teamAppIdentity`). When a verified account already uses the address,
 * the greeting names its person; the inviter never sees the email, so this
 * tells them nothing. The subscriber is always the address's own
 * (`emailSubscriberId`), never an account's. At most five per address per
 * day; past that the email is skipped. Never throws: the member row is
 * already written.
 */
export const queueTeamInvitation = async (input: {
	teamId: string;
	email: string;
	role: TeamMemberRole;
	inviterName: string;
}): Promise<void> => {
	try {
		const email = input.email.trim().toLowerCase();
		// Fails closed: with Redis down no invitation email goes out (the
		// member row is still created), rather than an unbounded number.
		const perAddress = await checkAndRecordRateLimit(
			addressKey(email),
			INVITES_PER_ADDRESS_PER_DAY,
			86_400,
			{ failClosed: true },
		);
		if (!perAddress.allowed) {
			logger.warn({ teamId: input.teamId }, "Team invitation email skipped: address limit reached");
			return;
		}
		const [team, account] = await Promise.all([
			db.teamsApp.where({ id: input.teamId }).select("name", "slug", "appName").takeOptional(),
			// Only a verified address personalises the greeting: an unverified
			// account with this address may belong to someone else.
			db.users.where({ email, emailVerified: true }).select("name").takeOptional(),
		]);
		const app = teamAppIdentity({
			slug: team?.slug ?? null,
			name: team?.name ?? "",
			appName: team?.appName ?? null,
		});
		await queueNotification(
			{
				workflowId: "team-invitation",
				to: { subscriberId: emailSubscriberId(email), email },
				payload: {
					teamName: team?.name ?? "your team",
					role: input.role,
					inviterName: input.inviterName || "A teammate",
					...(account?.name ? { name: account.name } : {}),
					email,
					appName: app.appName,
					url: `${app.origin}/dashboard`,
				},
			},
			{ singletonKey: `team_invitation:${input.teamId}:${email}` },
		);
	} catch (err) {
		logger.error({ err, teamId: input.teamId }, "Team invitation not queued");
	}
};
