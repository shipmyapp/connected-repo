import { teamsAppRouter } from "@backend/modules/teams/teams_app.router";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import type { TeamInviteRole } from "@connected-repo/zod-schemas/team_app.zod";
import { createRouterClient } from "@orpc/server";
import { ulid } from "ulid";

type TestContext = Awaited<ReturnType<typeof createUserAndLogin>>;

/**
 * The same login, sending `x-team-id: teamId`. The active-team gate re-reads
 * the user row when the cookie's copy names another team.
 */
export const onTeam = (context: TestContext, teamId: string): TestContext => {
	const reqHeaders = new Headers(context.reqHeaders);
	reqHeaders.set("x-team-id", teamId);
	return { ...context, reqHeaders };
};

export const teamsClient = (context: TestContext) =>
	createRouterClient(teamsAppRouter, { context });

/** A shared team created by `owner` and made their active team. */
export const createSharedTeam = async (owner: TestContext, name = "Shared team") => {
	const team = await teamsClient(owner).createTeam({ name });
	await teamsClient(owner).setActiveTeam({ teamAppId: team.id });
	return { teamId: team.id, owner: onTeam(owner, team.id) };
};

/**
 * A new verified account invited to the inviter's active team with `role`,
 * which has claimed the invitation and made that team active.
 */
export const addMember = async (
	inviter: TestContext,
	teamId: string,
	role: TeamInviteRole,
): Promise<TestContext> => {
	const email = `member-${ulid().toLowerCase()}@example.com`;
	await teamsClient(inviter).addTeamMember({ email, role });
	const member = await createUserAndLogin({ email });
	await teamsClient(member).getMyTeams();
	await teamsClient(member).setActiveTeam({ teamAppId: teamId });
	return onTeam(member, teamId);
};

/** The caller's membership row id in its active team. */
export const memberIdOf = async (context: TestContext): Promise<string> => {
	const members = await teamsClient(context).getTeamMembers();
	const own = members.find((m) => m.userId === context.user.id);
	if (!own) throw new Error("not a member");
	return own.id;
};
