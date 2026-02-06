import { z } from "zod";
import { teamRoleZod } from "../user-teams/user-teams.zod.js";

// Base team member schema
export const teamMemberZod = z.object({
	teamMemberId: z.string().ulid(),
	userTeamId: z.string().ulid(),
	userId: z.string().uuid().nullable(),
	email: z.string().email(),
	role: teamRoleZod,
	joinedAt: z.number().nullable(),
	createdAt: z.number(),
	updatedAt: z.number(),
});

export type TeamMember = z.infer<typeof teamMemberZod>;

// Team member with user details
export const teamMemberWithUserZod = teamMemberZod.extend({
	userName: z.string().nullable(),
	userAvatar: z.string().url().nullable(),
});

export type TeamMemberWithUser = z.infer<typeof teamMemberWithUserZod>;

// Add member input
export const addMemberZod = z.object({
	userTeamId: z.string().ulid(),
	email: z.string().email(),
	role: teamRoleZod,
});

export type AddMember = z.infer<typeof addMemberZod>;

// Remove member input
export const removeMemberZod = z.object({
	userTeamId: z.string().ulid(),
	teamMemberId: z.string().ulid(),
});

export type RemoveMember = z.infer<typeof removeMemberZod>;

// Update role input
export const updateRoleZod = z.object({
	userTeamId: z.string().ulid(),
	teamMemberId: z.string().ulid(),
	role: teamRoleZod,
});

export type UpdateRole = z.infer<typeof updateRoleZod>;

// Get members input
export const getMembersZod = z.object({
	userTeamId: z.string().ulid(),
});

export type GetMembers = z.infer<typeof getMembersZod>;
