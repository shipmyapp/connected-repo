import { novu } from "@backend/configs/novu.config";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import type { PushOffReason } from "@connected-repo/zod-schemas/device.zod";

/**
 * Sync a user's live push addresses into their Novu subscriber's `fcm`
 * credentials. Assumes the caller has already written the device rows and now
 * needs Novu to reflect them. Throws on Novu failure so the caller's
 * transaction can roll back. Moved from `register_device.notifications.service.ts`,
 * reading `devices` instead of `push_devices`.
 *
 * The full list is sent instead of Novu's `append`/`delete` because the
 * database is the source of truth: one code path for registering and
 * revoking, and no drift from dropped or retried calls.
 */
export const syncNovuFcmCredentials = async (userId: string): Promise<void> => {
	if (!novu) return;

	const activeTokens = (
		await db.devices.where({ userId, pushOffAt: null, fcmToken: { not: null } }).pluck("fcmToken")
	).flatMap((token) => (token ? [token] : []));

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
 * Push stops on this person's device (switched off here, or signing out): the
 * device named by its key, or by the address the app last used when its
 * cookie went missing. The row keeps its address for the record; Novu is
 * told in the same transaction, so a failure leaves push as it was and the
 * person can try again, never "off here, still sent by Novu".
 */
export const pushOffDevice = async (params: {
	userId: string;
	deviceKey: string | null;
	fcmToken?: string | null;
	reason: PushOffReason;
	now?: number;
}): Promise<void> => {
	const { userId, deviceKey, fcmToken, reason, now = Date.now() } = params;
	const which = [...(deviceKey ? [{ deviceKey }] : []), ...(fcmToken ? [{ fcmToken }] : [])];
	if (which.length === 0) return;
	await db.$transaction(async () => {
		const changed = await db.devices
			.where({ userId, pushOffAt: null, fcmToken: { not: null } })
			.where({ OR: which })
			.update({ pushOffAt: now, pushOffReason: reason });
		if (changed > 0) await syncNovuFcmCredentials(userId);
	});
};
