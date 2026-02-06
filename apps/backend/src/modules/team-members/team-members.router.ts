import { db } from "@backend/db/db.js";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure.js";
import { ulid } from "ulid";
import {
	addMemberZod,
	getMembersZod,
	removeMemberZod,
	teamMemberWithUserZod,
	teamMemberZod,
	updateRoleZod,
} from "./team-members.zod.js";
import { z } from "zod";

export const teamMembersRouter = {
	// Add a new member to the team
	addMember: rpcProtectedProcedure
		.route({ method: 'POST' })
		.input(addMemberZod)
		.output(teamMemberZod)
		.handler(async ({ input, context }) => {
			const userId = context.user.id;
			const { userTeamId, email, role } = input;

			// Check if user is owner or admin
			const requester = await db.teamMembers.findBy({
				userTeamId,
				userId,
			});

			if (!requester || !["owner", "admin"].includes(requester.role)) {
				throw new Error("Insufficient permissions");
			}

			// Check if member already exists
			// Note: email + teamId is unique, so we check for that
			const existing = await db.teamMembers.findBy({
				userTeamId,
				email,
			});

			if (existing) {
				throw new Error("Member with this email already exists in the team");
			}

			// Check if user exists by email
			const existingUser = await db.users.findBy({ email });

			// Create team member
			const member = await db.teamMembers.create({
				teamMemberId: ulid(),
				userTeamId,
				userId: existingUser?.id ?? null,
				email,
				role,
				joinedAt: existingUser ? Date.now() : null, // Only set joinedAt if user exists
			});

			return member;
		}),

	// Remove a member from the team
	removeMember: rpcProtectedProcedure
		.route({ method: 'DELETE' })
		.input(removeMemberZod)
		.handler(async ({ input, context }) => {
			const userId = context.user.id;
			const { userTeamId, teamMemberId } = input;

			// Check if user is owner or admin
			const requester = await db.teamMembers.findBy({
				userTeamId,
				userId,
			});

			if (!requester || !["owner", "admin"].includes(requester.role)) {
				throw new Error("Insufficient permissions");
			}

			// Get the member to remove
			const memberToRemove = await db.teamMembers.findBy({ teamMemberId });

			if (!memberToRemove || memberToRemove.userTeamId !== userTeamId) {
				throw new Error("Member not found");
			}

			// Cannot remove owner
			if (memberToRemove.role === "owner") {
				throw new Error("Cannot remove team owner");
			}

			// Admins can only remove users, not other admins (unless they're the owner)
			if (requester.role === "admin" && memberToRemove.role === "admin") {
				throw new Error("Admins cannot remove other admins");
			}

			// Delete member
			await db.teamMembers.findBy({ teamMemberId }).delete();

			return { success: true };
		}),

	// Update member role
	updateRole: rpcProtectedProcedure
		.route({ method: 'PATCH' })
		.input(updateRoleZod)
		.output(teamMemberZod)
		.handler(async ({ input, context }) => {
			const userId = context.user.id;
			const { userTeamId, teamMemberId, role } = input;

			// Check if user is owner or admin
			const requester = await db.teamMembers.findBy({
				userTeamId,
				userId,
			});

			if (!requester || !["owner", "admin"].includes(requester.role)) {
				throw new Error("Insufficient permissions");
			}

			// Get the member to update
			const memberToUpdate = await db.teamMembers.findBy({ teamMemberId });

			if (!memberToUpdate || memberToUpdate.userTeamId !== userTeamId) {
				throw new Error("Member not found");
			}

			// Cannot change owner role
			if (memberToUpdate.role === "owner" || role === "owner") {
				throw new Error("Cannot change owner role");
			}

			// Admins can only promote to admin, not demote admins
			if (requester.role === "admin") {
				if (memberToUpdate.role === "admin") {
					throw new Error("Admins cannot change other admins' roles");
				}
				if (role !== "admin") {
					throw new Error("Admins can only promote users to admin");
				}
			}

			// Update role
			await db.teamMembers.findBy({ teamMemberId }).update({ role });
			
			// Fetch and return the updated member
			return db.teamMembers.find(teamMemberId);
		}),

	// Get all members of a team
	getMembers: rpcProtectedProcedure
		.route({ method: 'GET' })
		.input(getMembersZod)
		.output(z.array(teamMemberWithUserZod))
		.handler(async ({ input, context }) => {
			const userId = context.user.id;
			const { userTeamId } = input;

			// Check if user is a member of the team
			const requester = await db.teamMembers.findBy({
				userTeamId,
				userId,
			});

			if (!requester) {
				throw new Error("You are not a member of this team");
			}

			// Get all members with user details
			const members = await db.teamMembers
				.where({ userTeamId })
				.select(
					"teamMemberId",
					"userTeamId",
					"userId",
					"email",
					"role",
					"joinedAt",
					"createdAt",
					"updatedAt",
					{
						user: (q) =>
							q.user.select(
								"name",
								"image",
							),
					}
				);

			return members.map((m) => ({
				...m,
				userName: m.user?.name ?? null,
				userAvatar: m.user?.image ?? null,
			}));
		}),
};
