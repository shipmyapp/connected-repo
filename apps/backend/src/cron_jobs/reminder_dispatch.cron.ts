import { db } from "@backend/db/db";
import { userReminderTaskDef } from "@backend/events/events.schema";
import { tbus } from "@backend/events/tbus";
import { logger } from "@backend/utils/logger.utils";
import cron, { type ScheduledTask } from "node-cron";

// Any bigint. Used as the pg_advisory_xact_lock() key so only one replica
// dispatches per tick — the losers see `acquired=false` and skip. Pick a
// value nothing else in this codebase claims. If you add another advisory
// lock elsewhere, use a different bigint.
const REMINDER_DISPATCH_LOCK_KEY = 823_401_101_001n;

let scheduledTask: ScheduledTask | null = null;

/**
 * Fires every minute. Queries users whose current local time (per their
 * `timezone`) matches any entry in `journalReminderTimes`, then dispatches
 * a pg-tbus `send_user_reminder` task per match. The tbus task's
 * singletonKey scoped to (userId, YYYY-MM-DD, HH:MM) makes it safe against
 * (a) the cron tick running >1s and dispatching twice in the same minute,
 * (b) a stale replica racing before the advisory lock is acquired.
 */
export async function reminderDispatchTick(): Promise<void> {
	try {
		await db.$transaction(async () => {
			const lockResult = await db.$query<{ acquired: boolean }>`
				SELECT pg_try_advisory_xact_lock(${REMINDER_DISPATCH_LOCK_KEY}::bigint) AS acquired
			`;
			if (!lockResult.rows[0]?.acquired) return;

			const dueUsersResult = await db.$query<{
				id: string;
				email: string;
				name: string;
				timezone: string;
			}>`
				SELECT id, email, name, timezone
				FROM users
				WHERE email IS NOT NULL
					AND EXISTS (
						SELECT 1 FROM UNNEST(journal_reminder_times) rt
						WHERE TO_CHAR(rt, 'HH24:MI') = TO_CHAR((NOW() AT TIME ZONE timezone), 'HH24:MI')
					)
			`;
			const dueUsers = dueUsersResult.rows;

			if (dueUsers.length === 0) return;

			const utcDate = new Date();
			const withEmail = dueUsers.filter(
				(u): u is typeof u & { email: string } => Boolean(u.email),
			);
			await Promise.all(
				withEmail.map((user) => {
					const hhmm = new Intl.DateTimeFormat("en-GB", {
						timeZone: user.timezone,
						hour: "2-digit",
						minute: "2-digit",
						hour12: false,
					}).format(utcDate);
					const ymd = new Intl.DateTimeFormat("en-CA", {
						timeZone: user.timezone,
						year: "numeric",
						month: "2-digit",
						day: "2-digit",
					}).format(utcDate);
					return tbus.send(
						userReminderTaskDef.from(
							{
								userId: user.id,
								email: user.email,
								name: user.name,
								reminderTime: hhmm,
							},
							{
								singletonKey: `user_reminder:${user.id}:${ymd}:${hhmm}`,
							},
						),
					);
				}),
			);

			logger.info(
				{
					dispatched: withEmail.length,
					skippedNoEmail: dueUsers.length - withEmail.length,
				},
				"Reminder dispatch tick",
			);
		});
	} catch (error) {
		logger.error({ err: error }, "Reminder dispatch tick failed");
	}
}

export function startReminderDispatchCron(): void {
	if (scheduledTask) return;
	scheduledTask = cron.schedule("* * * * *", () => {
		void reminderDispatchTick();
	});
}

export function stopReminderDispatchCron(): void {
	scheduledTask?.stop();
	scheduledTask = null;
}
