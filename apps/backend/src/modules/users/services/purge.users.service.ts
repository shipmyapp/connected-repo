import { db } from "@backend/db/db";
import { markSessionRevoked } from "@backend/modules/auth/services/revoked_sessions.auth.service";
import {
	objectKeysOfFiles,
	queueObjectDeletions,
} from "@backend/modules/files/services/object_deletion.files.service";
import { moveUsersOffTeams } from "@backend/modules/teams/services/active_team.teams.service";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@connected-repo/zod-schemas/account.zod";
import { findDeletionBlockers } from "./deletion.users.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Requests made at or before this time are due. */
export const purgeCutoff = (now = Date.now()) => now - ACCOUNT_DELETION_GRACE_DAYS * DAY_MS;

type PurgeOutcome = "purged" | "not_due" | "blocked" | "gone";

/** Keys a client can present again: browser cookies and native ids, not migration placeholders. */
const presentable = (key: string | null): key is string =>
	!!key && !key.startsWith("legacy-") && !key.startsWith("token-");

/**
 * Deletes one account whose grace period is over (or any requested one with
 * `force`, for the console's audited purgeAccountNow). One transaction. Never
 * touches a shared team: by construction (findDeletionBlockers, re-checked
 * here) the person is in none. Order, which is what keeps every foreign key:
 *   1. bucket objects of the person's files and of their personal team(s) → queue;
 *   2. device keys of their sessions and devices → erased_device_keys;
 *   3. active teams: theirs to null, anyone on their personal team moved off
 *      (users.active_team_app_id is ON DELETE RESTRICT);
 *   4. journal entries and files: theirs anywhere, and everything in their
 *      personal team(s) (journal_entries.team_id is SET NULL, so a team
 *      delete alone would orphan them);
 *   5. memberships they had in other teams (all already left): email and
 *      phone scrubbed so no row can be claimed as an invitation;
 *   6. teams they created: creator set to null;
 *   7. personal team(s) hard-deleted (members cascade);
 *   8. sessions and accounts (no foreign key: nothing cascades);
 *   9. the user row: devices, push_devices, connected-app clients, tokens,
 *      consents and actions cascade; `afterDelete` publishes user.deleted,
 *      whose handler deletes the Novu subscriber.
 * Kept: operator_audit_log rows (append-only, no foreign key; an operator's
 * record of what was done names the account by id), API product rows
 * (`teams_api`, subscriptions, request logs: no link to a person).
 */
export async function purgeAccount(
	userId: string,
	options: { now?: number; force?: boolean } = {},
): Promise<PurgeOutcome> {
	const now = options.now ?? Date.now();
	return db.$transaction(async (): Promise<PurgeOutcome> => {
		const user = await db.users.select("deletionRequestedAt").findOptional(userId);
		if (!user) return "gone";
		if (user.deletionRequestedAt === null) return "not_due";
		if (!options.force && user.deletionRequestedAt > purgeCutoff(now)) return "not_due";
		if ((await findDeletionBlockers(userId)).length > 0) return "blocked";

		const personalTeamIds = await db.teamsApp
			.includeDeleted()
			.where({ personalTeamForUserId: userId })
			.pluck("id");
		const ownOrPersonalFiles =
			personalTeamIds.length > 0
				? { OR: [{ createdByUserId: userId }, { teamId: { in: personalTeamIds } }] }
				: { createdByUserId: userId };

		// 1.
		const fileRows = await db.files
			.unscope("default")
			.includeDeleted()
			.where(ownOrPersonalFiles)
			.select("cdnUrl", "thumbnailCdnUrl");
		await queueObjectDeletions(objectKeysOfFiles(fileRows));

		// 2.
		const deviceKeys = new Set<string>([
			...(await db.devices.where({ userId }).pluck("deviceKey")).filter(presentable),
			...(await db.sessions.unscope("default").where({ userId }).pluck("deviceKey")).filter(
				presentable,
			),
		]);
		if (deviceKeys.size > 0) {
			await db.erasedDeviceKeys
				.createMany([...deviceKeys].map((deviceKey) => ({ deviceKey })))
				.onConflictDoNothing();
		}

		// 3.
		await db.users.find(userId).update({ activeTeamAppId: null });
		await moveUsersOffTeams(personalTeamIds);

		// 4. Files first: the entries' delete hook then finds nothing left.
		await db.files.unscope("default").includeDeleted().where(ownOrPersonalFiles).hardDelete();
		const ownOrPersonalEntries =
			personalTeamIds.length > 0
				? { OR: [{ authorUserId: userId }, { teamId: { in: personalTeamIds } }] }
				: { authorUserId: userId };
		await db.journalEntries
			.unscope("default")
			.includeDeleted()
			.where(ownOrPersonalEntries)
			.hardDelete();

		// 5.
		await db.teamMembers
			.unscope("default")
			.includeDeleted()
			.where({ userId })
			.update({ email: null, phoneNumber: null });

		// 6.
		await db.teamsApp
			.includeDeleted()
			.where({ createdByUserId: userId })
			.update({ createdByUserId: null });

		// 7.
		if (personalTeamIds.length > 0) {
			await db.teamsApp
				.includeDeleted()
				.where({ id: { in: personalTeamIds } })
				.hardDelete();
		}

		// 8. Sessions opened during the grace period end too; an Orchid delete
		//    runs no Better Auth hook, so mark them revoked.
		const purgedSessionIds = await db.sessions.unscope("default").where({ userId }).pluck("id");
		await db.sessions.unscope("default").where({ userId }).delete();
		await Promise.all(purgedSessionIds.map((id) => markSessionRevoked(id)));
		await db.accounts.where({ userId }).delete();

		// 9.
		await db.users.find(userId).delete();
		return "purged";
	});
}
