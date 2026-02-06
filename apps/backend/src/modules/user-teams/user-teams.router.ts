import { db } from "@backend/db/db.js";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure.js";
import { ulid } from "ulid";
import {
	userTeamCreateZod,
	userTeamDeleteZod,
	userTeamUpdateZod,
	userTeamWithRoleZod,
	userTeamZod,
} from "./user-teams.zod.js";
import { z } from "zod";

export const userTeamsRouter = {
	// Create a new team
	create: rpcProtectedProcedure
		.route({ method: 'POST' })
		.input(userTeamCreateZod)
		.output(userTeamZod)
		.handler(async ({ input, context }) => {
			const userId = context.user.id;
			const userTeamId = ulid();

			// Create team
			const team = await db.userTeams.create({
				userTeamId,
				name: input.name,
				logoUrl: input.logoUrl ?? null,
				createdByUserId: userId,
			});

			// Add creator as owner
			await db.teamMembers.create({
				teamMemberId: ulid(),
				userTeamId,
				userId,
				email: context.user.email,
				role: "owner",
				joinedAt: Date.now(),
			});

			return team;
		}),

	// Get all teams for the current user
	getMyTeams: rpcProtectedProcedure
		.route({ method: 'GET' })
		.output(z.array(userTeamWithRoleZod))
		.handler(async ({ context }) => {
			const userId = context.user.id;

			// Get all team memberships for this user
			const memberships = await db.teamMembers
				.where({ userId })
				.select(
					"userTeamId",
					"role",
					{
						userTeam: (q) =>
							q.userTeam.select(
								"userTeamId",
								"name",
								"logoUrl",
								"createdByUserId",
								"createdAt",
								"updatedAt",
								"deletedAt",
								{
									memberCount: (q) => q.members.count(),
								}
							),
					}
				);

			return memberships.map((m) => ({
				...m.userTeam!,
				role: m.role,
				memberCount: Number(m.userTeam?.memberCount ?? 0),
			}));
		}),

	// Update team details
	update: rpcProtectedProcedure
		.route({ method: 'PATCH' })
		.input(userTeamUpdateZod)
		.output(userTeamZod)
		.handler(async ({ input, context }) => {
			const userId = context.user.id;
			const { userTeamId, ...updates } = input;

			// Check if user is owner or admin
			const member = await db.teamMembers.findBy({
				userTeamId,
				userId,
			});

			if (!member || !["owner", "admin"].includes(member.role)) {
				throw new Error("Insufficient permissions");
			}

			// Update team
			await db.userTeams.findBy({ userTeamId }).update(updates);
			
			// Fetch and return the updated team
			return db.userTeams.find(userTeamId);
		}),

	// Delete team (soft delete)
	delete: rpcProtectedProcedure
		.route({ method: 'DELETE' })
		.input(userTeamDeleteZod)
		.handler(async ({ input, context }) => {
			const userId = context.user.id;
			const { userTeamId } = input;

			// Check if user is owner
			const member = await db.teamMembers.findBy({
				userTeamId,
				userId,
			});

			if (!member || member.role !== "owner") {
				throw new Error("Only team owner can delete the team");
			}

			// Soft delete team
			await db.userTeams.findBy({ userTeamId }).update({
				deletedAt: Date.now(),
			});

			return { success: true };
		}),
};
