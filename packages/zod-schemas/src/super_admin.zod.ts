import { z } from "zod";
import { teamMemberRoleZod } from "./enums.zod.js";
import { teamAppSelectAllZod } from "./team_app.zod.js";
import { zInteger, zString, zTimeEpoch } from "./zod_utils.js";

/** Search + page for every super-admin list. */
export const superAdminListInputZod = z.object({
	search: zString.max(120).optional(),
	limit: zInteger(1, 200).default(50),
	offset: zInteger(0).default(0),
});
export type SuperAdminListInput = z.infer<typeof superAdminListInputZod>;

export const superAdminTeamRowZod = teamAppSelectAllZod.extend({
	ownerEmail: z.string().nullable(),
	memberCount: zInteger(0),
});
export type SuperAdminTeamRow = z.infer<typeof superAdminTeamRowZod>;

export const superAdminTeamListOutputZod = z.object({
	rows: z.array(superAdminTeamRowZod),
	total: zInteger(0),
});
export type SuperAdminTeamListOutput = z.infer<typeof superAdminTeamListOutputZod>;

export const superAdminTeamMemberZod = z.object({
	id: z.ulid(),
	role: teamMemberRoleZod,
	email: z.string().nullable(),
	phoneNumber: z.string().nullable(),
	userId: z.uuid().nullable(),
	/** Null for someone added by email or phone who has not signed up yet. */
	userName: z.string().nullable(),
	addedAt: zTimeEpoch,
	joinedAt: zTimeEpoch.nullable(),
});
export type SuperAdminTeamMember = z.infer<typeof superAdminTeamMemberZod>;

export const superAdminTeamDetailZod = z.object({
	team: teamAppSelectAllZod,
	members: z.array(superAdminTeamMemberZod),
});
export type SuperAdminTeamDetail = z.infer<typeof superAdminTeamDetailZod>;

export const superAdminUserRowZod = z.object({
	id: z.uuid(),
	name: z.string(),
	email: z.string().nullable(),
	phoneNumber: z.string().nullable(),
	createdAt: zTimeEpoch,
	deletionRequestedAt: zTimeEpoch.nullable(),
});
export type SuperAdminUserRow = z.infer<typeof superAdminUserRowZod>;

export const superAdminUserListOutputZod = z.object({
	rows: z.array(superAdminUserRowZod),
	total: zInteger(0),
});
export type SuperAdminUserListOutput = z.infer<typeof superAdminUserListOutputZod>;

/** One console change, as the Audit page shows it. */
export const superAdminAuditRowZod = z.object({
	id: z.ulid(),
	actorUserId: z.uuid(),
	actorEmail: z.string().nullable(),
	action: z.string(),
	targetKind: z.string(),
	targetId: z.string().nullable(),
	before: z.unknown(),
	after: z.unknown(),
	reason: z.string().nullable(),
	ipAddress: z.string().nullable(),
	createdAt: zTimeEpoch,
});
export type SuperAdminAuditRow = z.infer<typeof superAdminAuditRowZod>;

export const superAdminAuditListInputZod = z.object({
	targetKind: zString.max(40).optional(),
	targetId: zString.max(100).optional(),
	limit: zInteger(1, 200).default(100),
	offset: zInteger(0).default(0),
});
export type SuperAdminAuditListInput = z.infer<typeof superAdminAuditListInputZod>;

export const superAdminAuditListOutputZod = z.object({
	rows: z.array(superAdminAuditRowZod),
	total: zInteger(0),
});
export type SuperAdminAuditListOutput = z.infer<typeof superAdminAuditListOutputZod>;

/** Ending every session of an account: why, in the operator's words. */
export const superAdminRevokeSessionsInputZod = z.object({
	userId: z.uuid(),
	reason: zString.min(3).max(300),
});
export type SuperAdminRevokeSessionsInput = z.infer<typeof superAdminRevokeSessionsInputZod>;

/** An operator acting on one account's deletion: why, in the operator's words. */
export const superAdminAccountDeletionInputZod = z.object({
	userId: z.uuid(),
	reason: zString.min(3).max(300),
});
export type SuperAdminAccountDeletionInput = z.infer<typeof superAdminAccountDeletionInputZod>;
