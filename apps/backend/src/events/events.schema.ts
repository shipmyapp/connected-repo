import { defineEvent, defineTask, Type } from "pg-tbus";

export const userCreatedEventDef = defineEvent({
	event_name: "user.created",
	schema: Type.Object({
		userId: Type.String({ format: "uuid" }),
		email: Type.String(),
		name: Type.String()
	}),
});

export const userReminderTaskDef = defineTask({
	task_name: "send_user_reminder",
	schema: Type.Object({
		userId: Type.String({ format: "uuid" }),
		email: Type.String({ format: 'email' }),
		name: Type.String(),
		reminderTime: Type.String(),
	}),
});

// Subscription alert webhook task - triggered when usage reaches 90%
export const subscriptionAlertWebhookTaskDef = defineTask({
	task_name: "subscription.alert_webhook",
	schema: Type.Object({
		subscriptionId: Type.String({ pattern: "^[0-9A-Z]{26}$" }),
		teamId: Type.String({ format: "uuid" }),
		payload: Type.Object({
			event: Type.Literal("subscription.usage_alert"),
			subscriptionId: Type.String({ pattern: "^[0-9A-Z]{26}$" }),
			teamId: Type.String({ format: "uuid" }),
			apiProductSku: Type.String(),
			requestsConsumed: Type.Number(),
			maxRequests: Type.Number(),
			usagePercent: Type.Number(),
			timestamp: Type.Number(),
		}),
	}),
	config: {
		retryLimit: 3,
		retryDelay: 10,        // Start with 60 seconds
		retryBackoff: true,    // Exponential: 60s, 120s, 240s
		expireInSeconds: 300,  // 5 minute timeout per attempt
		keepInSeconds: 604800, // 7 days retention
	},
});