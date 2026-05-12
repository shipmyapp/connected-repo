import { journalEntriesRouter } from '@backend/modules/journal-entries/journal-entries.router';
import { promptsRouter } from '@backend/modules/prompts/prompts.router';
import { filesRouter } from '@backend/modules/files/files.router';
import { rpcPublicProcedure } from '@backend/procedures/public.procedure';
import { usersRouter } from '@backend/modules/users/users.user_app.router';
import { syncRouter } from '@backend/modules/sync/sync.router';
import type { InferRouterInputs, InferRouterOutputs, RouterClient } from '@orpc/server';
import { cdnRouter } from '@backend/modules/cdn/cdn.user_app.router';
import { teamsAppRouter } from '@backend/modules/teams/teams_app.router';
import { offlineErrorsRouter } from '@backend/modules/offline_errors/offline_errors.router';
import { z } from "zod";
import { meRouter } from '@backend/modules/users/me.user_app.router';

// Phase 1: Basic health check and testing endpoints
// Modules will be added in later phases

// Health check endpoint
const healthCheck = rpcPublicProcedure
	.route({ method: 'GET' })
	.output(z.object({
		status: z.string(),
		timestamp: z.string(),
		phase: z.number(),
		message: z.string(),
	}))
	.handler(async () => {
		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
			phase: 1,
			message: 'Phase 1: Core Infrastructure - oRPC server is running',
		}
	})
		
export const ReactAppRouter = {
	cdn: cdnRouter,
	files: filesRouter,
	health: healthCheck,
	journalEntries: journalEntriesRouter,
	offlineErrors: offlineErrorsRouter,
	me: meRouter, 
	prompts: promptsRouter,
	sync: syncRouter,
	teams: teamsAppRouter,
	users: usersRouter,
};

export type ReactAppRouter = RouterClient<typeof ReactAppRouter>;
export type ReactAppRouterInputs = InferRouterInputs<typeof ReactAppRouter>
export type ReactAppRouterOutputs = InferRouterOutputs<typeof ReactAppRouter>;
