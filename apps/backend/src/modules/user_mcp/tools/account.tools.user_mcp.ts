import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { teamForCall, teamIdZod } from "../services/team.user_mcp.service";
import { defineTool, type ToolContext } from "./define_tool.user_mcp";

const isoOrNull = (ms: number | null | undefined): string | null =>
	ms ? new Date(ms).toISOString() : null;

export function registerAccountTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: "whoami",
		title: "Who am I",
		description:
			"The person this connection works for: name, email, time zone, the team they have open in the app, their teams, and what this connection may do.",
		scope: "read",
		kind: "read",
		input: {},
		run: async (_args, ctx) => {
			const profile = await ctx.app().me.profile();
			return {
				summary: `Connected as ${profile.name}.`,
				data: {
					name: profile.name,
					email: profile.email,
					timezone: profile.timezone,
					openTeamId: profile.activeTeamAppId,
					teams: profile.teams.map((team) => ({ id: team.id, name: team.name })),
					connection: { scopes: ctx.principal.scopes },
				},
			};
		},
	});

	defineTool(server, ctx, {
		name: "list_teams",
		title: "List my teams",
		description:
			"The teams the person belongs to, with their role in each and which one is open in the app. Use a team's id as `teamId` in other tools.",
		scope: "read",
		kind: "read",
		input: {},
		run: async (_args, ctx) => {
			const teams = await ctx.app().teams.getMyTeams();
			const userId = ctx.principal.user.id;
			const openTeamId = ctx.principal.user.activeTeamAppId;
			return {
				summary: `${teams.length} team(s).`,
				data: {
					teams: teams.map((team) => ({
						id: team.id,
						name: team.name,
						role: team.userRole,
						isPersonal: team.personalTeamForUserId === userId,
						isOpenInApp: team.id === openTeamId,
					})),
				},
			};
		},
	});

	defineTool(server, ctx, {
		name: "list_team_members",
		title: "List a team's members",
		description:
			"The members of one of the person's teams: email or phone, role, and whether they have joined yet.",
		scope: "read",
		kind: "read",
		input: { teamId: teamIdZod },
		run: async (args, ctx) => {
			const team = await teamForCall(ctx.principal, args.teamId);
			const members = await ctx.app(team.teamId).teams.getTeamMembers();
			return {
				summary: `${members.length} member(s) in ${team.teamName}.`,
				data: {
					team: { id: team.teamId, name: team.teamName },
					members: members.map((member) => ({
						memberId: member.id,
						userId: member.userId,
						email: member.email,
						phoneNumber: member.phoneNumber,
						role: member.role,
						joinedAt: isoOrNull(member.joinedAt),
						invitePending: member.userId === null,
					})),
				},
			};
		},
	});
}
