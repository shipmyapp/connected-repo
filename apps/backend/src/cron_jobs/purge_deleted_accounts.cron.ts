import { db } from "@backend/db/db";
import { drainObjectDeletions } from "@backend/modules/files/services/object_deletion.files.service";
import { purgeAccount, purgeCutoff } from "@backend/modules/users/services/purge.users.service";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { logger } from "@backend/utils/logger.utils";
import cron, { type ScheduledTask } from "node-cron";

// Its own advisory-lock key, distinct from the other crons'.
const PURGE_LOCK_KEY = 823_401_101_004n;
const PURGE_BATCH = 50;
const ERASED_DEVICE_KEY_TTL_MS = 400 * 24 * 60 * 60 * 1000;

let scheduledTask: ScheduledTask | null = null;

/**
 * Daily: deletes accounts whose grace period is over (oldest first, 50 a
 * tick), each in its own savepoint so one failure does not undo the others;
 * forgets erased device keys older than the device cookie's life; then
 * deletes queued bucket objects (after commit, so a failure there loses
 * nothing: the queue keeps them for the next tick).
 */
export async function purgeDeletedAccountsTick(now = Date.now()): Promise<{
	purged: number;
	blocked: number;
	failed: number;
}> {
	const counts = { purged: 0, blocked: 0, failed: 0 };
	try {
		await db.$transaction(async () => {
			const lock = await db.$query<{ acquired: boolean }>`
				SELECT pg_try_advisory_xact_lock(${PURGE_LOCK_KEY}::bigint) AS acquired
			`;
			if (!lock.rows[0]?.acquired) return;

			const due = await db.users
				.where({ deletionRequestedAt: { lte: new Date(purgeCutoff(now)) } })
				.order({ deletionRequestedAt: "ASC" })
				.limit(PURGE_BATCH)
				.pluck("id");
			for (const userId of due) {
				try {
					const outcome = await purgeAccount(userId, { now });
					if (outcome === "purged") counts.purged += 1;
					if (outcome === "blocked") {
						counts.blocked += 1;
						logger.warn({ userId }, "Account due for deletion still belongs to a team; skipped");
					}
				} catch (error) {
					counts.failed += 1;
					captureBackendException(error, {
						captureAll: true,
						tags: { handler: "cron.purge_deleted_accounts" },
					});
				}
			}

			await db.erasedDeviceKeys
				.where({ createdAt: { lt: new Date(now - ERASED_DEVICE_KEY_TTL_MS) } })
				.delete();
		});
		const drained = await drainObjectDeletions();
		logger.info({ ...counts, ...drained }, "Account purge tick");
	} catch (error) {
		logger.error({ err: error }, "Account purge tick failed");
		captureBackendException(error, {
			captureAll: true,
			tags: { handler: "cron.purge_deleted_accounts" },
		});
	}
	return counts;
}

export function startPurgeDeletedAccountsCron(): void {
	if (scheduledTask) return;
	// 02:47 UTC daily: off-peak, away from the other crons.
	scheduledTask = cron.schedule("47 2 * * *", () => {
		void purgeDeletedAccountsTick();
	});
}

export function stopPurgeDeletedAccountsCron(): void {
	scheduledTask?.stop();
	scheduledTask = null;
}
