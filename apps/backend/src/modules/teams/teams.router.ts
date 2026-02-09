import { db } from "@backend/db/db";
import { teamCreateInputZod, teamMemberRoleZod, teamMemberSelectAllZod, teamSelectAllZod, teamWithRoleZod } from "@connected-repo/zod-schemas/team.zod";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { z } from "zod";
import { ulid } from "ulid";

const getMyTeams = rpcProtectedProcedure
	.output(z.array(teamWithRoleZod))
	.handler(async ({ context: { user } }) => {
		const userId = user.id;
		const userEmail = user.email;
		
		// 1. Claim any memberships added by email but without userId
		if (userEmail) {
			await db.teamMembers
				.where({ email: userEmail, userId: null })
				.update({ 
					userId,
					joinedAt: Date.now()
				});
		}

		// 2. Join teams with team_members to get user role
		const teamsWithRoles = await db.teamsApp
			.join("members")
			.where({ "members.userId": userId })
			.select("*", "members.role");

		return teamsWithRoles.map(t => ({
			...t,
			userRole: t.role as any
		})) as any;
	});

const createTeam = rpcProtectedProcedure
	.input(teamCreateInputZod)
	.output(teamSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		const userId = user.id;

		return await db.$transaction(async () => {
			const team = await db.teamsApp.create({
				...input,
				createdByUserId: userId,
			});

			await db.teamMembers.create({
				teamMemberId: ulid(),
				teamId: team.teamId,
				userId,
				email: user.email,
				role: "owner",
				joinedAt: Date.now(),
			});

			return team;
		});
	});

const getTeamMembers = rpcProtectedProcedure
	.input(z.object({ teamId: z.uuid() }))
	.output(z.array(teamMemberSelectAllZod))
	.handler(async ({ input: { teamId }, context: { user } }) => {
		// Verify user is member of the team
		const membership = await db.teamMembers.where({ teamId, userId: user.id }).take();
		if (!membership) throw new Error("Unauthorized: Not a team member");

		return await db.teamMembers.where({ teamId });
	});

const addTeamMember = rpcProtectedProcedure
	.input(z.object({
		teamId: z.uuid(),
		email: z.email(),
		role: teamMemberRoleZod
	}))
	.output(teamMemberSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		const { teamId, email, role } = input;

		// Verify current user is Owner or Admin
		const actor = await db.teamMembers.where({ teamId, userId: user.id }).take();
		if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
			throw new Error("Unauthorized: Only Owners and Admins can add members");
		}

		// Try to find if user already exists on platform
		const targetUser = await db.users.where({ email }).take();

		return await db.teamMembers.create({
			teamMemberId: ulid(),
			teamId,
			userId: targetUser?.id || null,
			email,
			role,
			joinedAt: targetUser ? Date.now() : null,
		});
	});

const removeTeamMember = rpcProtectedProcedure
	.input(z.object({ teamMemberId: z.ulid() }))
	.output(z.object({ success: z.boolean() }))
	.handler(async ({ input: { teamMemberId }, context: { user } }) => {
		const target = await db.teamMembers.where({ teamMemberId }).take();
		if (!target) throw new Error("Member not found");

		// Verify actor has permission
		const actor = await db.teamMembers.where({ teamId: target.teamId, userId: user.id }).take();
		if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
			throw new Error("Unauthorized");
		}

		// Owners cannot be removed by Admins
		if (target.role === "owner" && actor.role === "admin") {
			throw new Error("Unauthorized: Admins cannot remove the Owner");
		}

		// Cannot remove yourself if you are the only owner? (Optional check)

		await db.teamMembers.where({ teamMemberId }).delete();
		return { success: true };
	});

const updateMemberRole = rpcProtectedProcedure
	.input(z.object({
		teamMemberId: z.ulid(),
		role: teamMemberRoleZod
	}))
	.output(teamMemberSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		const { teamMemberId, role } = input;
		const target = await db.teamMembers.where({ teamMemberId }).take();
		if (!target) throw new Error("Member not found");

		const actor = await db.teamMembers.where({ teamId: target.teamId, userId: user.id }).take();
		if (!actor || actor.role !== "owner") {
			throw new Error("Unauthorized: Only Owners can change roles");
		}

		return await db.teamMembers.where({ teamMemberId }).selectAll().take().update({ role });
	});

export const teamsRouter = {
	getMyTeams,
	createTeam,
	getTeamMembers,
	addTeamMember,
	removeTeamMember,
	updateMemberRole,
};
