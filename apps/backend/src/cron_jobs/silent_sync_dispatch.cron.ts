import { firebaseMessaging } from "@backend/configs/firebase_admin.config";
import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
import cron, { type ScheduledTask } from "node-cron";

// Distinct advisory-lock key so this doesn't collide with reminder or
// reconcile crons.
const SILENT_SYNC_LOCK_KEY = 823_401_101_003n;

// FCM sendEachForMulticast tops out at 500 tokens per call.
const FCM_MULTICAST_BATCH = 500;

let scheduledTask: ScheduledTask | null = null;

/**
 * Fan out a data-only FCM push to every active PWA install so the
 * service worker (see `sw/sw.ts`) wakes up and calls
 * `sync.processQueue()` — pulling any server-side changes and pushing
 * any queued local writes. Runs every 3 minutes. Bypasses Novu because
 * Novu's push channel adds a notification block that would render on
 * the OS — we want the SW to swallow this push silently.
 *
 * Payload contract with the SW:
 *   `data: { type: "silent-sync", ts: "<epoch-ms>" }`
 * The SW branches on `data.type === "silent-sync"` and calls
 * `postMessage({ type: "sync-now" })` on all open clients, skipping
 * `showNotification` entirely.
 */
export async function silentSyncDispatchTick(): Promise<void> {
	const messaging = firebaseMessaging;
	if (!messaging) return; // credentials absent — silent push disabled

	try {
		await db.$transaction(async () => {
			const lockResult = await db.$query<{ acquired: boolean }>`
				SELECT pg_try_advisory_xact_lock(${SILENT_SYNC_LOCK_KEY}::bigint) AS acquired
			`;
			if (!lockResult.rows[0]?.acquired) return;

			const tokensResult = await db.$query<{ fcm_token: string }>`
				SELECT fcm_token FROM push_devices WHERE uninstalled_at IS NULL
			`;
			const tokens = tokensResult.rows.map((r) => r.fcm_token);
			if (tokens.length === 0) return;

			let totalSuccess = 0;
			let totalFailure = 0;
			const invalidTokens: string[] = [];

			for (let i = 0; i < tokens.length; i += FCM_MULTICAST_BATCH) {
				const batch = tokens.slice(i, i + FCM_MULTICAST_BATCH);
				try {
					const res = await messaging.sendEachForMulticast({
						tokens: batch,
						data: {
							type: "silent-sync",
							ts: String(Date.now()),
						},
					});
					totalSuccess += res.successCount;
					totalFailure += res.failureCount;
					// Collect tokens FCM reports as unregistered so the reconcile
					// cron can prune them on the next nightly pass.
					res.responses.forEach((r: { success: boolean; error?: { code?: string } }, idx: number) => {
						if (
							!r.success &&
							(r.error?.code === "messaging/registration-token-not-registered" ||
								r.error?.code === "messaging/invalid-registration-token")
						) {
							const token = batch[idx];
							if (token) invalidTokens.push(token);
						}
					});
				} catch (err) {
					totalFailure += batch.length;
					logger.warn(
						{ err, batchSize: batch.length },
						"[silent-sync] FCM multicast batch failed",
					);
				}
			}

			if (invalidTokens.length > 0) {
				// Soft-delete unregistered tokens so we don't burn API calls on
				// them next tick. Nightly reconcile does the deeper Novu-side
				// prune; this handles the FCM-side signal we already have.
				await db.pushDevices
					.where({ fcmToken: { in: invalidTokens } })
					.update({
						uninstalledAt: Date.now(),
						deactivationReason: "fcm_invalid",
					});
			}

			logger.info(
				{
					total: tokens.length,
					success: totalSuccess,
					failure: totalFailure,
					pruned: invalidTokens.length,
				},
				"Silent sync dispatch tick",
			);
		});
	} catch (error) {
		logger.error({ err: error }, "Silent sync dispatch tick failed");
	}
}

export function startSilentSyncDispatchCron(): void {
	if (scheduledTask) return;
	// Every 3 minutes.
	scheduledTask = cron.schedule("*/3 * * * *", () => {
		void silentSyncDispatchTick();
	});
}

export function stopSilentSyncDispatchCron(): void {
	scheduledTask?.stop();
	scheduledTask = null;
}
