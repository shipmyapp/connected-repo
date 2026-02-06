import { leadsRouter } from '@backend/modules/leads/leads.router'
import { rpcPublicProcedure } from '@backend/procedures/public.procedure'
import { rpcProtectedProcedure } from '@backend/procedures/protected.procedure'
import { usersRouter } from '@backend/routers/user_app/users.user_app.router'
import { mediaRouter } from '@backend/routers/user_app/media.router'
import { userTeamsRouter } from '@backend/modules/user-teams/user-teams.router'
import { teamMembersRouter } from '@backend/modules/team-members/team-members.router'
import { syncRouter } from '@backend/modules/sync/sync.router'
import type { InferRouterInputs, InferRouterOutputs, RouterClient } from '@orpc/server'

export { rpcPublicProcedure } from '@backend/procedures/public.procedure';
export { rpcProtectedProcedure } from '@backend/procedures/protected.procedure';

// Phase 1: Basic health check and testing endpoints
// Modules will be added in later phases

// Health check endpoint
const healthCheck = rpcPublicProcedure
	.route({ method: 'GET' })
	.handler(async () => {
		return {
			status: 'ok',
			timestamp: new Date().toISOString(),
			phase: 1,
			message: 'Phase 1: Core Infrastructure - oRPC server is running',
		}
	})
	
export const userAppRouter = {
	health: healthCheck,
	users: usersRouter,
	leads: leadsRouter,
	media: mediaRouter,
	userTeams: userTeamsRouter,
	teamMembers: teamMembersRouter,
	sync: syncRouter,
};

export type UserAppRouter = RouterClient<typeof userAppRouter>;
export type UserAppRouterInputs = InferRouterInputs<typeof userAppRouter>
export type UserAppRouterOutputs = InferRouterOutputs<typeof userAppRouter>;
