import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { ConnectedAppScope } from "../oauth.user_mcp.config";
import type { ConnectedAppClient } from "../services/app_client.user_mcp.service";
import type { ConnectedAppPrincipal } from "../services/principal.user_mcp.service";
import { ToolRefusal } from "../services/team.user_mcp.service";

export interface ToolContext {
	principal: ConnectedAppPrincipal;
	reqHeaders: Headers;
	/** The app's own procedures as the token's person; pass a team id for team-scoped ones. */
	app: (teamId?: string | null) => ConnectedAppClient;
}

/** What a tool hands back: data for the model, and for a change, what to record. */
interface ToolOutput {
	/** One plain sentence first, for a person reading the transcript. */
	summary?: string;
	data: unknown;
	/** A change made for the person: recorded in `connected_app_actions`. */
	action?: {
		what: string;
		teamId?: string | null;
		entityTable?: string | null;
		entityId?: string | null;
	};
}

type Kind = "read" | "write" | "destructive";

interface ToolSpec<Shape extends z.ZodRawShape> {
	name: string;
	title: string;
	description: string;
	/** The permission the person gave on the consent screen that this tool needs. */
	scope: ConnectedAppScope;
	kind: Kind;
	input: Shape;
	/** Extra `_meta`, e.g. an MCP Apps view a tool renders (extension point). */
	meta?: Record<string, unknown>;
	run: (args: z.output<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<ToolOutput>;
}

/**
 * What the person asked for, in their words. Every tool takes it; a change
 * records it, every call logs it. The app can only ask: nothing checks it is
 * verbatim.
 */
const REQUEST_MAX = 500;
const requestZod = z
	.string()
	.trim()
	.max(REQUEST_MAX)
	.optional()
	.describe(
		"What the person asked for that led to this call, in their own words, verbatim where possible (one or two sentences). Always include it.",
	);

const annotationsFor = (kind: Kind, title: string): ToolAnnotations => ({
	title,
	readOnlyHint: kind === "read",
	destructiveHint: kind === "destructive",
	idempotentHint: kind === "read",
	openWorldHint: false,
});

/** A refusal, in words the model can pass on. */
const describeError = (error: unknown): string => {
	if (error instanceof ToolRefusal) return error.message;
	if (error instanceof ORPCError) {
		const data: unknown = error.data;
		const fieldErrors =
			data && typeof data === "object" && "fieldErrors" in data
				? JSON.stringify(data.fieldErrors)
				: "";
		return [error.message, fieldErrors].filter(Boolean).join(" ");
	}
	if (error instanceof z.ZodError) {
		return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
	}
	return error instanceof Error ? error.message : String(error);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asResult = (output: ToolOutput): CallToolResult => {
	const data = output.data;
	const text = [output.summary, JSON.stringify(data, null, 2)].filter(Boolean).join("\n\n");
	return {
		content: [{ type: "text", text }],
		...(isRecord(data)
			? { structuredContent: data }
			: data !== undefined
				? { structuredContent: { items: data } }
				: {}),
	};
};

const recordAction = async (
	spec: { name: string },
	output: ToolOutput,
	ctx: ToolContext,
	request: string | undefined,
): Promise<void> => {
	if (!output.action) return;
	await db.connectedAppActions.create({
		userId: ctx.principal.user.id,
		clientId: ctx.principal.clientId,
		teamId: output.action.teamId ?? null,
		tool: spec.name,
		what: output.action.what,
		request: request ?? null,
		entityTable: output.action.entityTable ?? null,
		entityId: output.action.entityId ?? null,
	});
};

/**
 * Registers one tool on the per-request server: only when the person granted
 * its scope, so an app sees only what it may do. Every call leaves one log
 * line (tool, outcome, duration, person, app); a change made for the person
 * is recorded with the app's client id; a refusal becomes a tool error the
 * model can read.
 */
export function defineTool<Shape extends z.ZodRawShape>(
	server: McpServer,
	ctx: ToolContext,
	spec: ToolSpec<Shape>,
): void {
	if (!ctx.principal.scopes.includes(spec.scope)) return;
	const schema = z.object(spec.input);
	// Widened to the plain shape so the SDK's callback type resolves; `schema` keeps the exact one.
	const inputSchema: z.ZodRawShape = { ...spec.input, request: requestZod };
	server.registerTool(
		spec.name,
		{
			title: spec.title,
			description: spec.description,
			inputSchema,
			annotations: annotationsFor(spec.kind, spec.title),
			...(spec.meta ? { _meta: spec.meta } : {}),
		},
		async (rawArgs: unknown): Promise<CallToolResult> => {
			const startedAt = Date.now();
			const log = {
				tool: spec.name,
				userId: ctx.principal.user.id,
				clientId: ctx.principal.clientId,
			};
			try {
				const { request } = z.object({ request: requestZod }).parse(rawArgs);
				const args = schema.parse(rawArgs);
				const output = await spec.run(args, ctx);
				await recordAction(spec, output, ctx, request);
				logger.info(
					{
						mcp: {
							...log,
							ok: true,
							durationMs: Date.now() - startedAt,
							...(request ? { request } : {}),
						},
					},
					"application MCP call",
				);
				return asResult(output);
			} catch (error) {
				logger.info(
					{
						mcp: { ...log, ok: false, durationMs: Date.now() - startedAt },
						err: error,
					},
					"application MCP call refused",
				);
				return {
					isError: true,
					content: [{ type: "text", text: describeError(error) }],
				};
			}
		},
	);
}
