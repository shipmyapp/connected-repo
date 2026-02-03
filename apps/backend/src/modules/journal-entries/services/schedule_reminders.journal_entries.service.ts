import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { userReminderTaskDef } from "@backend/events/events.schema";
import { tbus } from "@backend/events/tbus";
import { logger } from "@backend/utils/logger.utils";

/**
 * Schedule journal entry reminders for users whose reminder time matches the current minute.
 * All timezone conversion and time matching logic is done at the database level for efficiency.
 */
export const scheduleJournalEntryReminders = async (): Promise<void> => {
	try {
		logger.info("Checking for journal entry reminders");

		const usersToNotify = await db
			.users
			.select("*", {
				reminderTime: () => sql<string>`to_char(now() AT TIME ZONE "timezone", 'HH24:MI')`
			})
			.where({
				journalReminderTimes: {
					has: sql`to_char(now() AT TIME ZONE "timezone", 'HH24:MI')`
				}
			});

		if (usersToNotify.length === 0) {
			logger.debug("No users need reminders at this time");
			return;
		}

		logger.info(
			{ count: usersToNotify.length },
			"Scheduling journal entry reminders"
		);

		// Schedule pg-tbus tasks for each user
		await Promise.all(
			usersToNotify.map((user) =>
				tbus.send(
					userReminderTaskDef.from({
						userId: user.id,
						email: user.email,
						name: user.name,
						reminderTime: user.reminderTime,
					})
				)
			)
		);

		logger.info(
			{ count: usersToNotify.length },
			"Successfully scheduled journal entry reminders"
		);
	} catch (error) {
		logger.error(
			{ error },
			"Error scheduling journal entry reminders"
		);
		throw error;
	}
};
