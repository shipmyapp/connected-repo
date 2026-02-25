import { db } from "@backend/db/db";
import { teamAppCreateInputZod, teamAppMemberRoleZod, teamAppMemberSelectAllZod, teamAppSelectAllZod, teamWithRoleZod } from "@connected-repo/zod-schemas/team_app.zod";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { z } from "zod";

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
			.select("*", "members.joinedAt", "members.role");

		return teamsWithRoles.map(t => ({
			...t,
			joinedAt: t.joinedAt,
			userRole: t.role
		}));
	});

const createTeam = rpcProtectedProcedure
	.input(teamAppCreateInputZod)
	.output(teamAppSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		const userId = user.id;

		return await db.$transaction(async () => {
			const teamApp = await db.teamsApp.create({
				...input,
				createdByUserId: userId,
			});

			await db.teamMembers.create({
				teamId: teamApp.id,
				userId,
				email: user.email,
				role: "Owner",
				joinedAt: Date.now(),
			});

			return teamApp;
		});
	});

const getTeamMembers = rpcProtectedProcedure
	.input(z.object({ teamId: z.ulid() }))
	.output(z.array(teamAppMemberSelectAllZod))
	.handler(async ({ input: { teamId }, context: { user } }) => {
		// Verify user is member of the team
		const membership = await db.teamMembers.where({ teamId, userId: user.id }).takeOptional();
		if (!membership) throw new Error("Unauthorized: Not a team member");

		return await db.teamMembers.where({ teamId });
	});

const addTeamMember = rpcProtectedProcedure
	.input(z.object({
		teamId: z.ulid(),
		email: z.string().email(),
		role: teamAppMemberRoleZod
	}))
	.output(teamAppMemberSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		const { teamId, email } = input;

		// Verify current user is Owner or Admin
		const actor = await db.teamMembers.where({ teamId, userId: user.id }).takeOptional();
		if (!actor || (actor.role !== "Owner" && actor.role !== "Admin")) {
			throw new Error("Unauthorized: Only Owners and Admins can add members");
		}

		// Try to find if user already exists on platform
		const targetUser = await db.users.where({ email }).takeOptional();

		return await db.teamMembers.create({
			...input,
			userId: targetUser?.id || null,
			joinedAt: targetUser ? Date.now() : null,
		});
	});

const removeTeamMember = rpcProtectedProcedure
	.input(z.object({ id: z.ulid() }))
	.output(z.object({ success: z.boolean() }))
	.handler(async ({ input: { id }, context: { user } }) => {
		const target = await db.teamMembers.where({ id }).takeOptional();
		if (!target) throw new Error("Member not found");

		// Verify actor has permission
		const actor = await db.teamMembers.where({ id: target.id, userId: user.id }).takeOptional();
		if (!actor || (actor.role !== "Owner" && actor.role !== "Admin")) {
			throw new Error("Unauthorized");
		}

		// Owners cannot be removed by Admins
		if (target.role === "Owner" && actor.role === "Admin") {
			throw new Error("Unauthorized: Admins cannot remove the Owner");
		}

		await db.teamMembers.where({ id }).delete();
		return { success: true };
	});

const updateMemberRole = rpcProtectedProcedure
	.input(z.object({
		id: z.ulid(),
		role: teamAppMemberRoleZod
	}))
	.output(teamAppMemberSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		const { id, role } = input;
		const target = await db.teamMembers.where({ id }).take();
		if (!target) throw new Error("Member not found");

		const actor = await db.teamMembers.where({ id: target.id, userId: user.id }).take();
		if (!actor || actor.role !== "Owner") {
			throw new Error("Unauthorized: Only Owners can change roles");
		}

		return await db.teamMembers.where({ id }).selectAll().take().update({ role });
	});

export const teamsAppRouter = {
	getMyTeams,
	createTeam,
	getTeamMembers,
	addTeamMember,
	removeTeamMember,
	updateMemberRole,
};
