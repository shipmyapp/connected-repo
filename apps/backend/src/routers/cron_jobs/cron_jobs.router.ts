import { getTaskStats, queryFailedTasks } from "@backend/events/events.queries";
import { cronJobAuthProcedure } from "@backend/procedures/cron_job_auth.procedure";
import * as z from "zod";

/**
 * Get pg-tbus task statistics
 * Useful for monitoring task queue health
 */
const getTaskStatsEndpoint = cronJobAuthProcedure
	.route({ method: "GET", tags: ["Cron Jobs"] })
	.input(z.object({})) // Empty input for GET request
	.output(
		z.object({
			total: z.number(),
			pending: z.number(),
			active: z.number(),
			completed: z.number(),
			failed: z.number(),
			cancelled: z.number(),
			successRate: z.string(),
		})
	)
	.handler(async () => {
		return await getTaskStats();
	});

/**
 * Get recent failed tasks
 * Useful for debugging webhook or other task failures
 */
const getFailedTasksEndpoint = cronJobAuthProcedure
	.route({ method: "GET", path: "/failed-tasks", tags: ["Cron Jobs"] })
	.input(
		z.object({
			taskName: z.string().optional(),
			hours: z.number().default(24),
		})
	)
	.output(z.array(z.object({}).passthrough()))
	.handler(async ({ input }) => {
		const since = Date.now() - input.hours * 60 * 60 * 1000;
		return await queryFailedTasks(input.taskName, since);
	});

export const cronJobsRouter = {
	"task-stats": getTaskStatsEndpoint,
	"failed-tasks": getFailedTasksEndpoint,
};
