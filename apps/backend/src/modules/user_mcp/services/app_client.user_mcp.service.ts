import { journalEntriesRouter } from "@backend/modules/journal-entries/journal-entries.router";
import { promptsRouter } from "@backend/modules/prompts/prompts.router";
import { teamsAppRouter } from "@backend/modules/teams/teams_app.router";
import { meRouter } from "@backend/modules/users/me.user_app.router";
import { createRouterClient, type RouterClient } from "@orpc/server";
import type { ConnectedAppPrincipal } from "./principal.user_mcp.service";

/**
 * What a connected app can reach (ADR-045): a curated slice of the user
 * app's own procedures, so every rule (team scoping, validation, rate
 * limits, notifications, sync stamps) applies unchanged. Left out on
 * purpose: team administration (create, delete, members, roles, switching
 * the active team), journal update/delete, the sync procedures
 * (`pushCreates`, `pull*`), files and uploads (`cdn`, `files`),
 * notifications, devices, `connectedApps` itself. Add a procedure here only
 * together with a tool that needs it.
 */
const connectedAppRouter = {
	me: { profile: meRouter.profile },
	teams: {
		getMyTeams: teamsAppRouter.getMyTeams,
		getTeamMembers: teamsAppRouter.getTeamMembers,
	},
	journalEntries: {
		getAll: journalEntriesRouter.getAll,
		getById: journalEntriesRouter.getById,
		create: journalEntriesRouter.create,
	},
	prompts: {
		getAllActive: promptsRouter.getAllActive,
		getByCategory: promptsRouter.getByCategory,
		getById: promptsRouter.getById,
	},
};

export type ConnectedAppClient = RouterClient<typeof connectedAppRouter>;

/**
 * Request headers a procedure may use (the client address main.handler.ts
 * stamped, for logs and limits; tracing); never cookies or Authorization,
 * never the raw proxy headers.
 */
const FORWARDED_HEADERS = ["user-agent", "x-client-ip", "traceparent", "tracestate"] as const;

/**
 * A client of those procedures acting as the token's person. With a team id,
 * team-scoped procedures run for that team: `x-team-id` is set to it and the
 * context's `user.activeTeamAppId` is overridden for this call only, so
 * `rpcProtectedActiveTeamProcedure` (header check, membership row, request
 * context) runs unchanged. Nothing is written to `users.activeTeamAppId`.
 */
export const appClientFor = (
	principal: ConnectedAppPrincipal,
	reqHeaders: Headers,
	teamId: string | null = null,
): ConnectedAppClient => {
	const headers = new Headers();
	for (const name of FORWARDED_HEADERS) {
		const value = reqHeaders.get(name);
		if (value) headers.set(name, value);
	}
	if (teamId) headers.set("x-team-id", teamId);
	return createRouterClient(connectedAppRouter, {
		context: {
			reqHeaders: headers,
			session: principal.session,
			user: teamId ? { ...principal.user, activeTeamAppId: teamId } : principal.user,
			connectedApp: { clientId: principal.clientId },
		},
	});
};
