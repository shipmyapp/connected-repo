import { novu } from "@backend/configs/novu.config";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";

/**
 * Reconcile a single user's push_devices rows against their Novu subscriber's
 * `fcm` credentials. Novu prunes invalid FCM tokens automatically when FCM
 * returns "registration-token-not-registered" (uninstall / reinstall). This
 * job mirrors that state on our side so:
 *   - Stale rows don't inflate our "installed users" analytics.
 *   - Reminder-dispatch queries don't waste tbus tasks on tokens the push
 *     provider will silently drop.
 *
 * Runs nightly via the reconcile-fcm-tokens cron. Also safe to call
 * directly for a specific user on demand.
 */
export const reconcileUserFcmDevices = async (
	userId: string,
): Promise<{ pruned: number }> => {
	if (!novu) return { pruned: 0 };

	const now = Date.now();

	let liveTokens: Set<string>;
	try {
		const res = await novu.subscribers.retrieve(userId);
		const fcmChannel = res.result.channels?.find((c) => c.providerId === "fcm");
		liveTokens = new Set(fcmChannel?.credentials.deviceTokens ?? []);
	} catch (error) {
		const status = (error as { statusCode?: number })?.statusCode;
		if (status === 404) {
			// Subscriber deleted upstream — soft-delete every active row for
			// this user. The CASCADE on `users` deletion still handles the
			// hard cleanup when the user itself is gone.
			const pruned = await db.pushDevices
				.where({ userId, uninstalledAt: null })
				.update({
					uninstalledAt: now,
					deactivationReason: "subscriber_deleted",
				});
			return { pruned };
		}
		logger.error(
			{ userId, error },
			"Failed to fetch Novu subscriber during reconciliation",
		);
		throw error;
	}

	const localTokens = await db.pushDevices
		.where({ userId, uninstalledAt: null })
		.select("fcmToken");
	const toPrune = localTokens
		.map((r) => r.fcmToken)
		.filter((t) => !liveTokens.has(t));
	if (toPrune.length === 0) return { pruned: 0 };

	await db.pushDevices
		.where({ userId, fcmToken: { in: toPrune }, uninstalledAt: null })
		.update({
			uninstalledAt: now,
			deactivationReason: "novu_pruned",
		});
	return { pruned: toPrune.length };
};
