import { cdnRouter } from "@backend/modules/cdn/cdn.user_app.router";
import { filesRouter } from "@backend/modules/files/files.router";
import { journalEntriesRouter } from "@backend/modules/journal-entries/journal-entries.router";
import { promptsRouter } from "@backend/modules/prompts/prompts.router";
import { teamsAppRouter } from "@backend/modules/teams/teams_app.router";
import { meRouter } from "@backend/modules/users/me.user_app.router";
import { rpcPublicProcedure } from "@backend/procedures/public.procedure";
import type {
	InferRouterInputs,
	InferRouterOutputs,
	RouterClient,
} from "@orpc/server";
import { z } from "zod";

// Phase 1: Basic health check and testing endpoints
// Modules will be added in later phases

// Health check endpoint
const healthCheck = rpcPublicProcedure
	.route({ method: "GET", tags: ["Health Check"] })
	.output(
		z.object({
			status: z.string(),
			timestamp: z.string(),
			phase: z.number(),
			message: z.string(),
		}),
	)
	.handler(async () => {
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
			phase: 1,
			message: "Phase 1: Core Infrastructure - oRPC server is running",
		};
	});

export const userAppRouter = {
	cdn: cdnRouter,
	files: filesRouter,
	health: healthCheck,
	journalEntries: journalEntriesRouter,
	me: meRouter,
	prompts: promptsRouter,
	teams: teamsAppRouter,
};

export type UserAppRouter = RouterClient<typeof userAppRouter>;
export type UserAppRouterInputs = InferRouterInputs<typeof userAppRouter>;
export type UserAppRouterOutputs = InferRouterOutputs<typeof userAppRouter>;
