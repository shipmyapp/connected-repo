import { novu } from "@backend/configs/novu.config";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import { upsertSubscriber } from "@backend/utils/notifications.utils";
import type { DevicePlatform } from "@connected-repo/zod-schemas/enums.zod";
import { ulid } from "ulid";

/**
 * Sync a user's active FCM tokens into their Novu subscriber's `fcm`
 * credentials. Assumes the caller has already touched the DB row and now
 * needs Novu to reflect the DB state. Throws on Novu failure so the caller's
 * transaction can roll back.
 */
const syncNovuFcmCredentials = async (userId: string): Promise<void> => {
	if (!novu) return;

	const activeTokens = (
		await db.pushDevices
			.where({ userId, uninstalledAt: null })
			.select("fcmToken")
	).map((row) => row.fcmToken);

	try {
		await novu.subscribers.credentials.update(
			{
				providerId: "fcm",
				credentials: { deviceTokens: activeTokens },
			},
			userId,
		);
	} catch (error) {
		logger.error(
			{ userId, tokenCount: activeTokens.length, error },
			"Failed to sync FCM credentials to Novu",
		);
		throw error;
	}
};

/**
 * Register (or refresh) an FCM device token for a user, then sync the user's
 * FULL set of active tokens to their Novu subscriber's `fcm` credentials.
 *
 * Sync-full-list instead of Novu's `append`/`delete` primitives because the
 * DB is the source of truth: keeping Novu in lockstep with the push_devices
 * table simplifies revocation (one code path) and prevents drift from
 * dropped/retried operations. Extra cost is a single indexed SELECT per
 * register/revoke — cheap compared to the Novu round-trip.
 *
 * Concurrency: the whole DB write + Novu sync runs inside a single
 * transaction. Novu failure rolls the DB row back so we never leak an
 * "active locally, unknown to Novu" row that the nightly reconcile would
 * later have to clean up. The upsert uses `INSERT ... ON CONFLICT
 * (fcm_token) WHERE uninstalled_at IS NULL DO UPDATE` targeted at the
 * partial unique index from migration 0007, so two concurrent registers
 * of the same token can't race past the read-then-write window.
 */
export const registerFcmDevice = async (params: {
	userId: string;
	fcmToken: string;
	userAgent?: string | null;
	userEmail?: string | null;
	userName?: string | null;
	platform?: DevicePlatform | null;
	pwaInstalled?: boolean;
	pwaStandaloneLaunch?: boolean;
}) => {
	const {
		userId,
		fcmToken,
		userAgent,
		userEmail,
		userName,
		platform,
		pwaInstalled,
		pwaStandaloneLaunch,
	} = params;
	const nowMs = Date.now();
	// The ORM columns are `timestamp().asNumber()` (ms-epoch), but raw SQL
	// bypasses that conversion — Postgres would try to parse the raw ms
	// integer as a timestamp string and fail. Convert once here.
	const nowIso = new Date(nowMs).toISOString();
	const pwaInstalledAtIso = pwaInstalled ? nowIso : null;
	const pwaLastLaunchedAtIso = pwaStandaloneLaunch ? nowIso : null;
	const newId = ulid();

	await db.$transaction(async () => {
		// Single-statement upsert against the partial unique index
		// (push_devices_fcm_token_active_idx, migration 0007). Postgres
		// requires the ON CONFLICT predicate to match the index's WHERE
		// clause exactly. On conflict we:
		//   - reassign userId (rare: device switched accounts)
		//   - refresh lifecycle fields to reflect the new register
		//   - keep pwa_installed_at unless it was NULL (first-observed sticks)
		await db.$query`
			INSERT INTO push_devices (
				id, user_id, fcm_token, user_agent, platform,
				pwa_installed_at, pwa_last_launched_at,
				uninstalled_at, deactivation_reason,
				last_seen_at, created_at, updated_at
			)
			VALUES (
				${newId}, ${userId}::uuid, ${fcmToken}, ${userAgent ?? null},
				${platform ?? null},
				${pwaInstalledAtIso}::timestamptz, ${pwaLastLaunchedAtIso}::timestamptz,
				NULL, NULL,
				${nowIso}::timestamptz, NOW(), NOW()
			)
			ON CONFLICT (fcm_token) WHERE uninstalled_at IS NULL
			DO UPDATE SET
				user_id = EXCLUDED.user_id,
				user_agent = EXCLUDED.user_agent,
				platform = EXCLUDED.platform,
				pwa_installed_at = COALESCE(
					push_devices.pwa_installed_at,
					EXCLUDED.pwa_installed_at
				),
				pwa_last_launched_at = EXCLUDED.pwa_last_launched_at,
				last_seen_at = EXCLUDED.last_seen_at,
				updated_at = NOW()
		`;

		if (!novu) return;

		await upsertSubscriber(userId, {
			email: userEmail ?? null,
			firstName: userName ?? null,
		});

		await syncNovuFcmCredentials(userId);
	});
};

/**
 * Soft-revoke a device (user opted out on Profile, browser signed out, or
 * pushsubscriptionchange invalidated the old token). Marks `uninstalledAt`
 * so the row survives for lifecycle analytics but doesn't participate in
 * future sync-to-Novu calls. Re-registration clears the timestamp.
 *
 * DB write + Novu sync run in one transaction — if Novu is unreachable, the
 * soft-delete rolls back and the user can retry, avoiding a "revoked locally,
 * still-active on Novu" split-brain that would keep push flowing.
 */
export const revokeFcmDevice = async (params: {
	userId: string;
	fcmToken: string;
}) => {
	const { userId, fcmToken } = params;

	await db.$transaction(async () => {
		await db.pushDevices
			.where({ userId, fcmToken, uninstalledAt: null })
			.update({
				uninstalledAt: Date.now(),
				deactivationReason: "user_revoked",
			});

		await syncNovuFcmCredentials(userId);
	});
};
