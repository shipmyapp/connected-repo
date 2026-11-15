import { db } from "@backend/db/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ulid } from "ulid";
import { z } from "zod";
import { confirmationFor, isConfirmationValid } from "../services/confirmation.user_mcp.service";
import { teamForCall, teamIdZod } from "../services/team.user_mcp.service";
import { defineTool, type ToolContext } from "./define_tool.user_mcp";

const PREVIEW_CHARS = 280;

export function registerJournalTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: "list_journal_entries",
		title: "List journal entries",
		description:
			"The person's own journal entries in one team, newest first, each with a short preview. Use get_journal_entry for the full text.",
		scope: "read",
		kind: "read",
		input: {
			teamId: teamIdZod,
			limit: z.number().int().min(1).max(100).default(20),
			contains: z
				.string()
				.trim()
				.min(1)
				.max(200)
				.optional()
				.describe("Only entries whose text or prompt contains these words (case-insensitive)."),
		},
		run: async (args, ctx) => {
			const team = await teamForCall(ctx.principal, args.teamId);
			const rows = await ctx.app(team.teamId).journalEntries.getAll();
			const needle = args.contains?.toLowerCase();
			const matching = rows
				.filter(
					(row) =>
						!needle ||
						row.content.toLowerCase().includes(needle) ||
						(row.prompt ?? "").toLowerCase().includes(needle),
				)
				.sort((a, b) => b.createdAt - a.createdAt);
			return {
				summary: `${matching.length} entr${matching.length === 1 ? "y" : "ies"} in ${team.teamName}.`,
				data: {
					team: { id: team.teamId, name: team.teamName },
					total: matching.length,
					entries: matching.slice(0, args.limit).map((row) => ({
						id: row.id,
						createdAt: new Date(row.createdAt).toISOString(),
						prompt: row.prompt,
						preview: row.content.slice(0, PREVIEW_CHARS),
						length: row.content.length,
					})),
				},
			};
		},
	});

	defineTool(server, ctx, {
		name: "get_journal_entry",
		title: "Read a journal entry",
		description: "One of the person's journal entries in full, with the names of its attachments.",
		scope: "read",
		kind: "read",
		input: {
			id: z.ulid().describe("The entry's id, from list_journal_entries."),
			teamId: teamIdZod,
		},
		run: async (args, ctx) => {
			const team = await teamForCall(ctx.principal, args.teamId);
			const entry = await ctx.app(team.teamId).journalEntries.getById({ id: args.id });
			return {
				data: {
					id: entry.id,
					createdAt: new Date(entry.createdAt).toISOString(),
					prompt: entry.prompt,
					promptId: entry.promptId,
					content: entry.content,
					attachments: entry.files.map((file) => ({
						fileName: file.fileName,
						mimeType: file.mimeType,
					})),
				},
			};
		},
	});

	defineTool(server, ctx, {
		name: "create_journal_entry",
		title: "Add a journal entry",
		description:
			"Adds a journal entry for the person in one of their teams. Call it first without `confirmation`: it saves nothing and answers with what would be saved, an `entryId` and a `confirmation` code. Show the person the text; only when they agree, call it again with the same arguments plus `entryId` and `confirmation`. The entry then appears on the person's devices at their next sync, and their teammates are notified.",
		scope: "write",
		kind: "write",
		input: {
			content: z
				.string()
				.trim()
				.min(1)
				.max(50_000)
				.describe("The entry's text, as the person wants it saved."),
			promptId: z.ulid().optional().describe("The prompt this entry answers, from list_prompts."),
			teamId: teamIdZod,
			entryId: z
				.ulid()
				.optional()
				.describe("The entryId the preview returned; send it back with the confirmation."),
			confirmation: z
				.string()
				.max(200)
				.optional()
				.describe("The confirmation code the preview returned."),
		},
		run: async (args, ctx) => {
			const team = await teamForCall(ctx.principal, args.teamId);
			const app = ctx.app(team.teamId);
			const prompt = args.promptId ? await app.prompts.getById({ id: args.promptId }) : null;
			// The id is minted at preview time and bound into the code, so a
			// retried save is the same row (`onConflictDoNothing("id")`) and the
			// same fan-out (`singletonKey`), never a duplicate.
			const entryId = args.entryId ?? ulid();
			const binding = {
				action: "create_journal_entry",
				userId: ctx.principal.user.id,
				clientId: ctx.principal.clientId,
				args: {
					content: args.content,
					promptId: args.promptId ?? null,
					teamId: team.teamId,
					entryId,
				},
			};
			const toSave = {
				team: { id: team.teamId, name: team.teamName },
				content: args.content,
				prompt: prompt?.text ?? null,
			};
			if (!args.confirmation || !args.entryId || !isConfirmationValid(args.confirmation, binding)) {
				return {
					summary: args.confirmation
						? "That confirmation is for other arguments or has expired; nothing was saved. Show the person this preview and confirm again."
						: "Nothing is saved yet. Show the person this preview, then call again with entryId and confirmation when they agree.",
					data: { saved: false, toSave, entryId, confirmation: confirmationFor(binding) },
				};
			}
			// The idempotency read: outside a team request, so the tenant scope
			// is lifted and the where names the person.
			const existing = await db.journalEntries
				.unscope("default")
				.where({ id: entryId, authorUserId: ctx.principal.user.id })
				.takeOptional();
			if (existing) {
				return {
					summary: "Already saved.",
					data: {
						saved: true,
						alreadySaved: true,
						entry: {
							id: existing.id,
							teamId: existing.teamId,
							createdAt: new Date(existing.createdAt).toISOString(),
						},
					},
				};
			}
			// The PWA's own online write path: teamId from the procedure's
			// activeTeamId, authorUserId from the principal, server timestamps for
			// pull-delta, and the created fan-out to teammates.
			const entry = await app.journalEntries.create({
				id: entryId,
				content: args.content,
				promptId: args.promptId ?? null,
				prompt: prompt?.text ?? null,
			});
			return {
				summary: `Saved in ${team.teamName}.`,
				data: {
					saved: true,
					entry: {
						id: entry.id,
						teamId: entry.teamId,
						createdAt: new Date(entry.createdAt).toISOString(),
						content: entry.content,
						prompt: entry.prompt,
					},
				},
				action: {
					what: "Added a journal entry",
					teamId: team.teamId,
					entityTable: "journal_entries",
					entityId: entry.id,
				},
			};
		},
	});
}
