import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { subscriptionAlertWebhookTaskDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import axios from "axios";
import { ulid } from "ulid";

/**
 * Handler for subscription alert webhook task
 * Sends webhook notification when subscription usage reaches 90%
 * Logs all execution details to pg_tbus_task_log table for audit trail
 */
export const subscriptionAlertWebhookHandler = async ({
	name,
	input,
	trigger,
}: {
	name: string;
	input: {
		subscriptionId: string;
		teamId: string;
		payload: {
			event: "subscription.usage_alert";
			subscriptionId: string;
			teamId: string;
			apiProductSku: string;
			requestsConsumed: number;
			maxRequests: number;
			usagePercent: number;
			timestamp: number;
		};
	};
	trigger: { type: "direct" } | { type: "event"; e: { id: string; name: string; p: number } };
}) => {
	const startTime = Date.now();
	const logId = ulid();
	
	// Create initial log entry
	await db.pgTbusTaskLogs.create({
		pgTbusTaskLogId: logId,
		tbusTaskId: null, // Will be populated if we can get it from pg-tbus context
		taskName: subscriptionAlertWebhookTaskDef.task_name,
		queueName: env.OTEL_SERVICE_NAME,
		entityType: "subscription",
		entityId: input.subscriptionId,
		teamId: input.teamId,
		status: "active",
		attemptNumber: 0,
		scheduledAt: null,
		startedAt: startTime,
		completedAt: null,
		success: null,
		errorMessage: null,
		errorCode: null,
		responseStatusCode: null,
		payload: input.payload,
		response: null,
		retryLimit: subscriptionAlertWebhookTaskDef.config?.retryLimit ?? 3,
		willRetry: null,
	});

	try {
		// Get team webhook configuration
		const team = await db.teams.find(input.teamId).select(
			"subscriptionAlertWebhookBearerToken",
			"subscriptionAlertWebhookUrl"
		);

		if (!team.subscriptionAlertWebhookUrl) {
			logger.warn({
				logId,
				teamId: input.teamId,
			}, "No webhook URL configured for team, skipping webhook");

			// Update log as completed (no webhook configured is not a failure)
			await db.pgTbusTaskLogs.find(logId).update({
				status: "completed",
				completedAt: Date.now(),
				success: true,
				response: { skipped: true, reason: "No webhook URL configured" },
				willRetry: false,
			});

			return { success: true, skipped: true, reason: "No webhook URL configured" };
		}

		const webhookUrl = team.subscriptionAlertWebhookUrl;
		const bearerToken = team.subscriptionAlertWebhookBearerToken;

		// Send webhook
		const response = await axios.post(webhookUrl, input.payload, {
			timeout: 30000, // 30 second timeout
			...(bearerToken
				? {
					headers: {
						"Authorization": `Bearer ${bearerToken}`,
						"Content-Type": "application/json",
					},
				}
				: {
					headers: {
						"Content-Type": "application/json",
					},
				}
			),
		});

		const duration = Date.now() - startTime;

		// Update log with success
		await db.pgTbusTaskLogs.find(logId).update({
			status: "completed",
			completedAt: Date.now(),
			success: true,
			responseStatusCode: response.status,
			response: {
				statusCode: response.status,
				statusText: response.statusText,
				headers: response.headers,
			},
			willRetry: false,
		});

		return {
			success: true,
			statusCode: response.status,
			duration,
		};

	} catch (error) {
		const duration = Date.now() - startTime;
		const isAxiosError = axios.isAxiosError(error);
		
		const errorMessage = isAxiosError
			? error.message
			: error instanceof Error
				? error.message
				: "Unknown error";
		
		const errorCode = isAxiosError
			? error.code ?? "HTTP_ERROR"
			: "INTERNAL_ERROR";
		
		const statusCode = isAxiosError && error.response
			? error.response.status
			: null;

		logger.error({
			logId,
			error: errorMessage,
			errorCode,
			statusCode,
			duration,
			subscriptionId: input.subscriptionId,
			teamId: input.teamId,
		}, "Webhook failed");

		// Update log with failure
		await db.pgTbusTaskLogs.find(logId).update({
			status: "failed",
			completedAt: Date.now(),
			success: false,
			errorMessage,
			errorCode,
			responseStatusCode: statusCode,
			response: isAxiosError && error.response
				? {
					statusCode: error.response.status,
					statusText: error.response.statusText,
					data: error.response.data,
				}
				: null,
			willRetry: true, // pg-tbus will retry based on config
		});

		// Re-throw to trigger pg-tbus retry mechanism
		throw error;
	}
};
