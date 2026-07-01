import {
	subscriptionAlertWebhookTaskDef,
	userCreatedEventDef,
	userReminderTaskDef,
} from "@backend/events/events.schema";
import { reminderNotificationJournalEntryHandler } from "@backend/modules/journal-entries/notifications/reminder.notifications.journal_entries";
import { userCreatedNotificationHandler } from "@backend/modules/users/notifications/user_created.notifications.user";
import { subscriptionAlertWebhookHandler } from "@backend/modules/webhook_calls/handlers/subscription_alert_webhook.handler";
import { logger } from "@backend/utils/logger.utils";
import type { Query } from "orchid-orm";
import { createEventHandler, createTaskHandler } from "pg-tbus";
import { tbus } from "./tbus";

/**
 * Adapter for running pg-tbus queries within an Orchid ORM transaction
 * context. Pass the per-request `Query` so the bus insert participates in the
 * same transaction as the caller's writes.
 */
export const orchidToTbusQueryAdapter = (queryCtx: Query) => {
	return async <T = unknown>(props: {
		text: string;
		values: unknown[];
		name?: string;
	}): Promise<{ rows: T[]; rowCount: number }> => {
		const result = await queryCtx.q.adapter.query(props.text, props.values);
		return { rows: result.rows as T[], rowCount: result.rowCount };
	};
};

export const startEventBus = async () => {
	logger.info("Starting pg-tbus event bus...");

	try {
		tbus.registerHandler(
			createEventHandler({
				task_name: "user.created",
				eventDef: userCreatedEventDef,
				handler: userCreatedNotificationHandler,
			}),
		);

		tbus.registerTask(
			createTaskHandler({
				taskDef: userReminderTaskDef,
				handler: reminderNotificationJournalEntryHandler,
			}),
		);

		tbus.registerTask(
			createTaskHandler({
				taskDef: subscriptionAlertWebhookTaskDef,
				handler: subscriptionAlertWebhookHandler,
			}),
		);

		await tbus.start();
	} catch (error) {
		logger.error(error, "Failed to start pg-tbus event bus");
	}
};
