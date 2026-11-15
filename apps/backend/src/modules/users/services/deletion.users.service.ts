import { db } from "@backend/db/db";
import { markSessionRevoked } from "@backend/modules/auth/services/revoked_sessions.auth.service";
import { syncNovuFcmCredentials } from "@backend/modules/devices/services/push.devices.service";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { type AccountDeletionBlocker, purgeAfterOf } from "@connected-repo/zod-schemas/account.zod";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";
import { ORPCError } from "@orpc/server";

/**
 * What stands between a person and deleting their account: every live shared
 * team they are in (whatever their role), and their personal team when anyone
 * else is in it or invited to it. Empty = the request may go ahead.
 * `canLeave` mirrors the last-Owner rule (an Owner may leave only while another
 * Owner has joined); `canDelete` = Owner of a shared team.
 */
export async function findDeletionBlockers(userId: string): Promise<AccountDeletionBlocker[]> {
	const result = await db.$query<{
		team_id: string;
		name: string;
		role: TeamMemberRole;
		is_personal: boolean;
		other_owners: number;
		others: number;
	}>`
		SELECT t.id AS team_id, t.name, m.role,
			COALESCE(t.personal_team_for_user_id = ${userId}::uuid, false) AS is_personal,
			(SELECT count(*)::int FROM team_members o
				WHERE o.team_id = t.id AND o.deleted_at IS NULL AND o.role = 'Owner'
					AND o.user_id IS NOT NULL AND o.user_id <> ${userId}::uuid) AS other_owners,
			(SELECT count(*)::int FROM team_members o
				WHERE o.team_id = t.id AND o.deleted_at IS NULL
					AND o.user_id IS DISTINCT FROM ${userId}::uuid) AS others
		FROM team_members m
		JOIN teams_app t ON t.id = m.team_id
		WHERE m.user_id = ${userId}::uuid AND m.deleted_at IS NULL AND t.deleted_at IS NULL
		ORDER BY t.name
	`;
	return result.rows.flatMap((r): AccountDeletionBlocker[] => {
		if (r.is_personal) {
			return r.others > 0
				? [
						{
							teamId: r.team_id,
							name: r.name,
							role: r.role,
							kind: "personal_team_has_members",
							canLeave: false,
							canDelete: false,
						},
					]
				: [];
		}
		return [
			{
				teamId: r.team_id,
				name: r.name,
				role: r.role,
				kind: "shared_team",
				canLeave: r.role !== "Owner" || r.other_owners > 0,
				canDelete: r.role === "Owner",
			},
		];
	});
}

/**
 * Starts the grace period. Refused (409 LEAVE_TEAMS_FIRST, the teams in
 * `data.blockers`) while any team stands in the way. Otherwise, in one
 * transaction: stamps the request, ends every OTHER session (the caller's ends
 * when its device signs out after wiping its local copy), ends every connected
 * app (tokens and consents), turns push off on every device. Novu is told
 * afterwards, best effort: the purge deletes the subscriber anyway.
 */
export async function requestAccountDeletion(params: {
	userId: string;
	currentSessionId: string;
	now?: number;
}): Promise<{ deletionRequestedAt: number; purgeAfter: number }> {
	const { userId, currentSessionId, now = Date.now() } = params;
	const blockers = await findDeletionBlockers(userId);
	if (blockers.length > 0) {
		throw new ORPCError("LEAVE_TEAMS_FIRST", {
			status: 409,
			message: "Leave or delete your teams before deleting your account.",
			data: { blockers },
		});
	}
	// An Orchid delete runs no Better Auth hook: mark the ended sessions so
	// their cookie copies are refused at once.
	const endedSessionIds = await db.$transaction(async () => {
		await db.users.find(userId).update({ deletionRequestedAt: now });
		const ids = await db.sessions
			.unscope("default")
			.where({ userId, id: { not: currentSessionId } })
			.pluck("id");
		if (ids.length > 0)
			await db.sessions
				.unscope("default")
				.where({ id: { in: ids } })
				.delete();
		await db.oauthAccessTokens.where({ userId }).delete();
		await db.oauthRefreshTokens.where({ userId }).delete();
		await db.oauthConsents.where({ userId }).delete();
		await db.devices
			.where({ userId, pushOffAt: null, fcmToken: { not: null } })
			.update({ pushOffAt: now, pushOffReason: "signed_out" });
		return ids;
	});
	await Promise.all(endedSessionIds.map((id) => markSessionRevoked(id)));
	try {
		await syncNovuFcmCredentials(userId);
	} catch (error) {
		captureBackendException(error, { tags: { handler: "account_deletion_push_off" } });
	}
	return { deletionRequestedAt: now, purgeAfter: purgeAfterOf(now) };
}

/** Keeps the account. Push comes back when a device next reports itself. */
export async function cancelAccountDeletion(userId: string): Promise<void> {
	await db.users.find(userId).update({ deletionRequestedAt: null });
}
