import type { userReminderTaskDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import { triggerNotification } from "@backend/utils/notifications.utils";
import type { Static } from "pg-tbus";

export const reminderNotificationJournalEntryHandler = async ({
	input,
}: {
	input: Static<typeof userReminderTaskDef.schema>;
}) => {
	const { userId, reminderTime } = input;

	try {
		await triggerNotification({
			workflowId: "user-reminder",
			subscriberId: userId,
			payload: { reminderTime },
		});
	} catch (error) {
		logger.error(
			{ userId, error },
			"Error processing journal-entry reminder notification",
		);
		// Re-throw so pg-tbus applies the task's retry policy.
		throw error;
	}
};
