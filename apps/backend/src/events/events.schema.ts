import { defineEvent, defineTask, Type } from "pg-tbus";

export const userCreatedEventDef = defineEvent({
	event_name: "user.created",
	schema: Type.Object({
		userId: Type.String({ format: "uuid" }),
		email: Type.String(),
		name: Type.String(),
	}),
});

/**
 * Example on-demand notification task. Triggered explicitly by application
 * code via `tbus.send(userReminderTaskDef.from(...))` — no automatic scheduler.
 */
export const userReminderTaskDef = defineTask({
	task_name: "send_user_reminder",
	schema: Type.Object({
		userId: Type.String({ format: "uuid" }),
		email: Type.String({ format: "email" }),
		name: Type.String(),
		reminderTime: Type.String(),
	}),
	config: {
		retryLimit: 3,
		retryDelay: 60, // 60s, then exponential
		retryBackoff: true,
		expireInSeconds: 120,
		keepInSeconds: 604800, // 7 days
	},
});

// Triggered when API usage reaches the 90% threshold.
export const subscriptionAlertWebhookTaskDef = defineTask({
	task_name: "subscription.alert_webhook",
	schema: Type.Object({
		subscriptionId: Type.String({ pattern: "^[0-9A-Z]{26}$" }),
		teamApiId: Type.String({ format: "uuid" }),
		payload: Type.Object({
			event: Type.Literal("subscription.usage_alert"),
			subscriptionId: Type.String({ pattern: "^[0-9A-Z]{26}$" }),
			teamApiId: Type.String({ format: "uuid" }),
			apiProductSku: Type.String(),
			requestsConsumed: Type.Number(),
			maxRequests: Type.Number(),
			usagePercent: Type.Number(),
			timestamp: Type.Number(),
		}),
	}),
	config: {
		retryLimit: 3,
		retryDelay: 60,
		retryBackoff: true,
		expireInSeconds: 300,
		keepInSeconds: 604800,
	},
});
