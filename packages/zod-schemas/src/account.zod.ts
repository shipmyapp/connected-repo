import { z } from "zod";
import { teamMemberRoleZod } from "./enums.zod.js";
import { zTimeEpoch } from "./zod_utils.js";

/** Days between a deletion request and the purge. The one place to change it. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;
/** A sensitive act needs a session opened at most this long ago. */
export const RECENT_SIGN_IN_MINUTES = 10;
/** Rows per collection in one export; more is cut and named in `truncated`. */
export const ACCOUNT_EXPORT_ROW_CAP = 5_000;

const DAY_MS = 24 * 60 * 60 * 1000;
/** When a deletion requested at `requestedAt` is carried out. */
export const purgeAfterOf = (requestedAt: number): number =>
	requestedAt + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;

/**
 * A team that stands between a person and deleting their account.
 * `shared_team`: they are a member; `personal_team_has_members`: someone else
 * is in (or invited to) their personal team.
 */
export const accountDeletionBlockerZod = z.object({
	teamId: z.ulid(),
	name: z.string(),
	role: teamMemberRoleZod,
	kind: z.enum(["shared_team", "personal_team_has_members"]),
	/** Members and Admins can leave; an Owner only while another Owner has joined. */
	canLeave: z.boolean(),
	/** Only an Owner deletes a team; a personal team is never deleted by hand. */
	canDelete: z.boolean(),
});
export type AccountDeletionBlocker = z.infer<typeof accountDeletionBlockerZod>;

export const accountDeletionRequestOutputZod = z.object({
	deletionRequestedAt: zTimeEpoch,
	purgeAfter: zTimeEpoch,
});

/** One signed-in session, as the profile lists it. Never carries the token. */
export const accountSessionZod = z.object({
	id: z.string(),
	current: z.boolean(),
	browser: z.string().nullable(),
	os: z.string().nullable(),
	device: z.string().nullable(),
	createdAt: zTimeEpoch,
	lastActiveAt: zTimeEpoch,
	expiresAt: zTimeEpoch,
});
export type AccountSession = z.infer<typeof accountSessionZod>;

const rowsZod = z.array(z.record(z.string(), z.unknown()));

/** A person's own data, as `account.exportData` returns it. */
export const accountExportZod = z.object({
	format: z.literal("account-export/1"),
	exportedAt: zTimeEpoch,
	/** Collections that reached ACCOUNT_EXPORT_ROW_CAP and were cut. */
	truncated: z.array(z.string()),
	account: z.record(z.string(), z.unknown()),
	signInMethods: rowsZod,
	memberships: rowsZod,
	journalEntries: rowsZod,
	files: rowsZod,
	devices: rowsZod,
	sessions: rowsZod,
	connectedApps: rowsZod,
	connectedAppActions: rowsZod,
});
export type AccountExport = z.infer<typeof accountExportZod>;
