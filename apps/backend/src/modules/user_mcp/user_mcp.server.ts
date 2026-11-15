import { env } from "@backend/configs/env.config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	APP_DISPLAY_NAME,
	type ConnectedAppScope,
	USER_MCP_SERVER_NAME,
} from "./oauth.user_mcp.config";
import { appClientFor } from "./services/app_client.user_mcp.service";
import type { ConnectedAppPrincipal } from "./services/principal.user_mcp.service";
import { registerAccountTools } from "./tools/account.tools.user_mcp";
import type { ToolContext } from "./tools/define_tool.user_mcp";
import { registerJournalTools } from "./tools/journal.tools.user_mcp";
import { registerPromptTools } from "./tools/prompts.tools.user_mcp";

const NOT_GRANTED: Record<ConnectedAppScope, string> = {
	read: "read the person's teams and journal",
	write: "add journal entries",
};

const instructionsFor = (principal: ConnectedAppPrincipal): string => {
	const missing = (Object.keys(NOT_GRANTED) as ConnectedAppScope[]).filter(
		(scope) => !principal.scopes.includes(scope),
	);
	return [
		`${APP_DISPLAY_NAME} is a journal kept in teams. You are working for ${principal.user.name}.`,
		"A person belongs to one or more teams; journal entries and members belong to a team. Tools that work in a team take an optional teamId (from list_teams); without it they use the team the person has open in the app. Working in another team never changes which team the app shows.",
		"create_journal_entry answers first with a preview and a confirmation code: show the person exactly what would be saved and call again with the code only when they agree.",
		"Say what the person asked for in each call's `request` field, in their words: the app keeps it with what was done.",
		missing.length > 0
			? `This connection may not ${missing.map((scope) => NOT_GRANTED[scope]).join(", or ")}. The person can allow it by connecting again.`
			: "",
	]
		.filter(Boolean)
		.join("\n");
};

/**
 * The application MCP server (ADR-045): one instance per request (stateless
 * transport), built for the token's person with only the tools their
 * consent allows. Every tool calls the app's own procedures as that person.
 */
export function createUserMcpServer(
	principal: ConnectedAppPrincipal,
	reqHeaders: Headers,
): McpServer {
	const web = new URL(env.WEBAPP_URL).origin;
	const server = new McpServer(
		{
			name: USER_MCP_SERVER_NAME,
			title: APP_DISPLAY_NAME,
			version: "1.0.0",
			websiteUrl: env.WEBAPP_URL,
			// The PWA's own icons (apps/frontend/public), served by the frontend.
			icons: [
				{ src: `${web}/android-chrome-192x192.png`, mimeType: "image/png", sizes: ["192x192"] },
				{ src: `${web}/apple-touch-icon.png`, mimeType: "image/png", sizes: ["180x180"] },
			],
		},
		{ instructions: instructionsFor(principal) },
	);
	const ctx: ToolContext = {
		principal,
		reqHeaders,
		app: (teamId) => appClientFor(principal, reqHeaders, teamId ?? null),
	};
	registerAccountTools(server, ctx);
	registerJournalTools(server, ctx);
	registerPromptTools(server, ctx);
	return server;
}
