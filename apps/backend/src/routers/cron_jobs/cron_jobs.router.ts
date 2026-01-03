import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { initiateWebhookCallService } from "@backend/modules/webhook_calls/services/initiate.webhook_calls.service";
import { cronJobAuthProcedure } from "@backend/procedures/cron_job_auth.procedure";
import * as z from "zod";

const processWebhookCalls = cronJobAuthProcedure
	.route({ method: "POST", tags: ["Cron Jobs"] })
	.output(
		z.object({
			processed: z.number(),
		})
	)
	.handler(async () => {
		let cursor: { scheduledFor: number; webhookCallQueueId: string } | null = null;
		const batchSize = 100;
		let totalProcessed = 0;

		while (true) {
			const baseWhere = {
				scheduledFor: {
					lte: sql`NOW()`
				},
				status: {
					not: "Sent"
				},
				attempts: {
					lt: sql`"max_attempts"`
				}
			};

			let query = db.webhookCallQueues
				.selectAll()
				.where(baseWhere)
				.order({
					scheduledFor: "ASC",
					webhookCallQueueId: "ASC"
				})
				.limit(batchSize);

			if (cursor) {
				query = query.where(sql` (scheduled_for > ${cursor.scheduledFor} OR (scheduled_for = ${cursor.scheduledFor} AND webhook_call_queue_id > '${cursor.webhookCallQueueId}')) `);
			}

			const pendingCalls = await query;

			if (pendingCalls.length === 0) break;

			await Promise.all(pendingCalls.map(call => initiateWebhookCallService(call)));
			totalProcessed += pendingCalls.length;
			const lastCall = pendingCalls[pendingCalls.length - 1]!;
			cursor = {
				scheduledFor: lastCall.scheduledFor,
				webhookCallQueueId: lastCall.webhookCallQueueId
			};
		}

		return { processed: totalProcessed };
	});

export const cronJobsRouter = {
	"process-webhook-calls": processWebhookCalls,
};