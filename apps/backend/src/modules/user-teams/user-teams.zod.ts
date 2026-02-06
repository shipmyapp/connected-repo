import { z } from "zod";

// Team role enum
export const teamRoleZod = z.enum(["owner", "admin", "user"]);
export type TeamRole = z.infer<typeof teamRoleZod>;

// Base user team schema
export const userTeamZod = z.object({
	userTeamId: z.string().ulid(),
	name: z.string().min(3).max(50),
	logoUrl: z.string().url().nullable(),
	createdByUserId: z.string().uuid(),
	createdAt: z.number(),
	updatedAt: z.number(),
	deletedAt: z.number().nullable(),
});

export type UserTeam = z.infer<typeof userTeamZod>;

// User team with user's role
export const userTeamWithRoleZod = userTeamZod.extend({
	role: teamRoleZod,
	memberCount: z.number().optional(),
});

export type UserTeamWithRole = z.infer<typeof userTeamWithRoleZod>;

// Create user team input
export const userTeamCreateZod = z.object({
	name: z.string().min(3).max(50),
	logoUrl: z.string().url().optional(),
});

export type UserTeamCreate = z.infer<typeof userTeamCreateZod>;

// Update user team input
export const userTeamUpdateZod = z.object({
	userTeamId: z.string().ulid(),
	name: z.string().min(3).max(50).optional(),
	logoUrl: z.string().url().nullable().optional(),
});

export type UserTeamUpdate = z.infer<typeof userTeamUpdateZod>;

// Delete user team input
export const userTeamDeleteZod = z.object({
	userTeamId: z.string().ulid(),
});

export type UserTeamDelete = z.infer<typeof userTeamDeleteZod>;
