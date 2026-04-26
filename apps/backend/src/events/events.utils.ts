import { subscriptionAlertWebhookTaskDef, systemCronMinuteTaskDef, userCreatedEventDef, userReminderTaskDef } from "@backend/events/events.schema";
import { scheduleJournalEntryReminders } from "@backend/modules/journal-entries/services/schedule_reminders.journal_entries.service";
import { reminderNotificationJournalEntryHandler } from "@backend/modules/journal-entries/notifications/reminder.notifications.journal_entries";
import { userCreatedNotificationHandler } from "@backend/modules/users/notifications/user_created.notifications.user";
import { subscriptionAlertWebhookHandler } from "@backend/modules/webhook_calls/handlers/subscription_alert_webhook.handler";
import { logger } from "@backend/utils/logger.utils";
import type { Query } from "orchid-orm";
import { createEventHandler, createTaskHandler } from "pg-tbus";
import { tbus } from "./tbus";

/**
 * Adapter for running pg-tbus queries within an Orchid ORM transaction context
 */
export const orchidToTbusQueryAdapter = (queryCtx: Query) => {
	return async <T = any>(
		props: { text: string; values: any[]; name?: string }
	): Promise<{ rows: T[]; rowCount: number }> => {
		const result = await queryCtx.q.adapter.query(props.text, props.values);
		return { rows: result.rows as T[], rowCount: result.rowCount };
	};
};

/**
 * Start the event-bus
 */
export const startEventBus = async () => {
	logger.info("Starting pg-tbus event bus...");

	try {
		//All subscription and task-registrations go here.. 
		tbus.registerHandler(
			createEventHandler({
				task_name: "user.created",
				eventDef: userCreatedEventDef,
				handler: userCreatedNotificationHandler,
			})
		);
		tbus.registerTask(
			createTaskHandler({
				taskDef: userReminderTaskDef,
				handler: reminderNotificationJournalEntryHandler,
			})
		);
		tbus.registerTask(
			createTaskHandler({
				taskDef: subscriptionAlertWebhookTaskDef,
				handler: subscriptionAlertWebhookHandler,
			})
		);
		tbus.registerTask(
			createTaskHandler({
				taskDef: systemCronMinuteTaskDef,
				handler: async () => {
					logger.info("Executing system.cron.minute...");
					await scheduleJournalEntryReminders();

					// Schedule next run in 60 seconds (Recursive pattern)
					// We use a singletonKey in the task definition to prevent multiple chains
					await tbus.send(
						systemCronMinuteTaskDef.from(
							{ timestamp: Date.now() },
							{ startAfterSeconds: 60 }
						)
					);
				}
			})
		);

		await tbus.start();

		// Trigger the initial cron task if none is active
		// The singletonKey handles idempotency if one is already scheduled
		await tbus.send(systemCronMinuteTaskDef.from({ timestamp: Date.now() }));

	} catch (error) {
		logger.error(error, "Failed to start pg-tbus event bus");
	}
};