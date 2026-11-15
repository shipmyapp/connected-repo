import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool, type ToolContext } from "./define_tool.user_mcp";

const MAX_PROMPTS = 100;

export function registerPromptTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: "list_prompts",
		title: "List journaling prompts",
		description:
			"The app's journaling prompts (questions to write about), newest first, optionally in one category. A prompt's id can be passed to create_journal_entry.",
		scope: "read",
		kind: "read",
		input: {
			category: z.string().trim().min(1).max(100).optional(),
		},
		run: async (args, ctx) => {
			const prompts = args.category
				? await ctx.app().prompts.getByCategory({ category: args.category })
				: await ctx.app().prompts.getAllActive();
			return {
				summary: `${prompts.length} prompt(s).`,
				data: {
					prompts: prompts.slice(0, MAX_PROMPTS).map((prompt) => ({
						id: prompt.id,
						text: prompt.text,
						category: prompt.category,
						tags: prompt.tags,
					})),
				},
			};
		},
	});
}
