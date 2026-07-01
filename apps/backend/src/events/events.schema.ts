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

/**
 * Cluster-wide singleton exemplar. `singletonKey` combined with pg-tbus'
 * SKIP LOCKED semantics guarantees only one worker in the fleet runs this
 * task at a time — even if multiple instances trigger it. Use this pattern
 * for periodic reconciliation / cleanup jobs that must not fan out.
 *
 * Send with `tbus.send(systemTenantStatsRollupTaskDef.from({ triggeredAt: Date.now() }))`.
 * The handler runs under a "system" AsyncLocalStorage context (see
 * modules/system/handlers/tenant_stats_rollup.handler.ts) so it can
 * bypass tenant-scoped default query scopes via `.unscope('default')`.
 */
export const systemTenantStatsRollupTaskDef = defineTask({
	task_name: "system.tenant_stats_rollup",
	schema: Type.Object({
		triggeredAt: Type.Number(),
	}),
	config: {
		singletonKey: "system.tenant_stats_rollup",
		retryLimit: 2,
		retryDelay: 60,
		retryBackoff: true,
		expireInSeconds: 300,
		keepInSeconds: 604800,
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
