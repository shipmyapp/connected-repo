import { db } from "@backend/db/db";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";
import { z } from "zod";
import type { ConnectedAppPrincipal } from "./principal.user_mcp.service";

/** A refusal whose message is written for the model, and through it the person. */
export class ToolRefusal extends Error {}

/** The optional team argument every team-scoped tool takes. */
export const teamIdZod = z
	.ulid()
	.optional()
	.describe(
		"The team to work in, as list_teams returns it. Leave it out for the team the person has open in the app.",
	);

interface CallTeam {
	teamId: string;
	teamName: string;
	role: TeamMemberRole;
}

/**
 * The team a tool call works in (ADR-045): the one named, or the one the
 * person has open in the app. Membership is checked here so the model gets
 * a readable refusal; `rpcProtectedActiveTeamProcedure` checks it again.
 * `users.activeTeamAppId` is never written: an AI app must not switch the
 * team under the person's open devices.
 */
export async function teamForCall(
	principal: ConnectedAppPrincipal,
	requested: string | undefined,
): Promise<CallTeam> {
	const teamId = requested ?? principal.user.activeTeamAppId;
	if (!teamId) {
		throw new ToolRefusal(
			"This account has no team yet. Ask the person to open the app once, then try again.",
		);
	}
	const [member, team] = await Promise.all([
		db.teamMembers.unscope("default").where({ teamId, userId: principal.user.id }).takeOptional(),
		db.teamsApp.findOptional(teamId),
	]);
	if (!member || !team) {
		throw new ToolRefusal(
			"The person is not a member of that team. list_teams names the teams they belong to.",
		);
	}
	return { teamId, teamName: team.name, role: member.role };
}
