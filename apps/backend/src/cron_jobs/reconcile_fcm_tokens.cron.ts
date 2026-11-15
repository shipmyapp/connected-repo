import { db } from "@backend/db/db";
import { reconcileUserFcmDevices } from "@backend/modules/notifications/services/reconcile_devices.notifications.service";
import { logger } from "@backend/utils/logger.utils";
import cron, { type ScheduledTask } from "node-cron";

// Different bigint than reminder-dispatch's lock so they don't collide.
const RECONCILE_LOCK_KEY = 823_401_101_002n;

let scheduledTask: ScheduledTask | null = null;

/**
 * Nightly walk over every user with at least one push_devices row.
 * For each, fetch their Novu subscriber's `fcm` credentials and delete
 * push_devices rows whose token is no longer in Novu's list — Novu prunes
 * on FCM invalid-token errors, so this mirrors that state.
 *
 * Serialised (one user at a time) rather than parallel because Novu's API
 * rate limits are per-account and a burst of hundreds of concurrent
 * subscriber.retrieve() calls is easier to 429 than to control. Nightly
 * cadence means even N=10k users at 200ms each finishes in under an hour.
 */
async function reconcileFcmTokensTick(): Promise<void> {
	try {
		await db.$transaction(async () => {
			const lockResult = await db.$query<{ acquired: boolean }>`
				SELECT pg_try_advisory_xact_lock(${RECONCILE_LOCK_KEY}::bigint) AS acquired
			`;
			if (!lockResult.rows[0]?.acquired) return;

			const usersResult = await db.$query<{ user_id: string }>`
				SELECT DISTINCT user_id FROM push_devices WHERE uninstalled_at IS NULL
			`;
			const userIds = usersResult.rows.map((r) => r.user_id);
			if (userIds.length === 0) return;

			let totalPruned = 0;
			let failures = 0;
			for (const userId of userIds) {
				try {
					const { pruned } = await reconcileUserFcmDevices(userId);
					totalPruned += pruned;
				} catch {
					failures += 1;
				}
			}

			logger.info(
				{ users: userIds.length, totalPruned, failures },
				"FCM token reconciliation tick",
			);
		});
	} catch (error) {
		logger.error({ err: error }, "FCM token reconciliation tick failed");
	}
}

export function startReconcileFcmTokensCron(): void {
	if (scheduledTask) return;
	// 03:17 UTC every day. Off-peak, offset from top-of-hour to avoid
	// stampeding other 03:00 jobs.
	scheduledTask = cron.schedule("17 3 * * *", () => {
		void reconcileFcmTokensTick();
	});
}

export function stopReconcileFcmTokensCron(): void {
	scheduledTask?.stop();
	scheduledTask = null;
}
