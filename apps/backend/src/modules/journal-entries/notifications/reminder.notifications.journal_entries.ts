import { suprClient } from "@backend/configs/suprsend.config";
import { userReminderTaskDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import { Event } from "@suprsend/node-sdk";
import { Static } from "pg-tbus";

export const reminderNotificationJournalEntryHandler = async (
	{ input }: { input: Static<typeof userReminderTaskDef.schema> }
) => {
	const { userId, reminderTime } = input;

	try {
		// Trigger suprsend event for supplement reminder
		const eventProps = {
			reminderTime
		};

		const event_name = "USER REMINDER SCHEDULED"

		// Create and send the event via suprClient
		const event = new Event(userId, event_name, eventProps);
		const trigger = await suprClient.track_event(event);
		
		// Throwing here to know trigger failed.
		if (!trigger.success) throw new Error(`SuprSend Trigger Failed: ${trigger.message}`);

		return;
	} catch (error) {
		logger.error(
			{
				userId,
				error
			},
			"Error processing userStackReminder task handler",
		);

		// Throwing here forces pg-tbus to re-run this based on your retry policy
    throw error;
	}
};