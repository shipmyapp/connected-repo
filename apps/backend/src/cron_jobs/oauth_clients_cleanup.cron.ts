import { db } from "@backend/db/db";
import { UNUSED_OAUTH_CLIENT_DAYS } from "@backend/modules/user_mcp/oauth.user_mcp.config";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { logger } from "@backend/utils/logger.utils";
import cron, { type ScheduledTask } from "node-cron";

// Its own advisory-lock key, distinct from the other crons'.
const OAUTH_CLIENTS_CLEANUP_LOCK_KEY = 823_401_101_011n;

let scheduledTask: ScheduledTask | null = null;

/**
 * Removes connected apps nobody connected: registered (or fetched from a
 * metadata document) more than UNUSED_OAUTH_CLIENT_DAYS ago, with no
 * consent and no token. Registration is open, so without this the table
 * only grows.
 */
export async function oauthClientsCleanupTick(): Promise<void> {
	try {
		await db.$transaction(async () => {
			const lock = await db.$query<{ acquired: boolean }>`
				SELECT pg_try_advisory_xact_lock(${OAUTH_CLIENTS_CLEANUP_LOCK_KEY}::bigint) AS acquired
			`;
			if (!lock.rows[0]?.acquired) return;
			const result = await db.$query`
				DELETE FROM oauth_clients c
				WHERE c.created_at < now() - make_interval(days => ${UNUSED_OAUTH_CLIENT_DAYS})
					AND NOT EXISTS (SELECT 1 FROM oauth_consents x WHERE x.client_id = c.client_id)
					AND NOT EXISTS (SELECT 1 FROM oauth_access_tokens x WHERE x.client_id = c.client_id)
					AND NOT EXISTS (SELECT 1 FROM oauth_refresh_tokens x WHERE x.client_id = c.client_id)
			`;
			logger.info({ removed: result.rowCount }, "Unused connected apps removed");
		});
	} catch (error) {
		logger.error({ err: error }, "Connected apps cleanup failed");
		captureBackendException(error, {
			captureAll: true,
			tags: { handler: "cron.oauth_clients_cleanup" },
		});
	}
}

export function startOAuthClientsCleanupCron(): void {
	if (scheduledTask) return;
	// 04:41 UTC daily, away from the other crons.
	scheduledTask = cron.schedule("41 4 * * *", () => {
		void oauthClientsCleanupTick();
	});
}

export function stopOAuthClientsCleanupCron(): void {
	scheduledTask?.stop();
	scheduledTask = null;
}
