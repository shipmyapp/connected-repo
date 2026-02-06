import { db } from "@backend/db/db";
import { openApiPublicProcedure } from "@backend/procedures/open_api_public.procedure";
import { zTimezone } from "@connected-repo/zod-schemas/zod_utils";
import * as z from "zod";
import { teamRouter } from "./team.router";

// Health check endpoint for OpenAPI (public - no auth required)
const healthCheck = openApiPublicProcedure
	.route({ method: "GET", tags: ["Health"] })
	.output(
		z.object({
			status: z.string(),
			timestamp: z.string(),
			dbTimezone: z.string().min(1),
			backendTimezone: z.string().min(1)
		})
	)
	.handler(async () => {
		const backendTimezone = zTimezone.parse(Intl.DateTimeFormat().resolvedOptions().timeZone);
		try {
			// Test database connection by running a simple query
			await db.$query`SELECT 1`;
			const dbTimezoneResult = await db.$query`SELECT current_setting('timezone') as timezone`;
			const dbTimezone = zTimezone.parse(dbTimezoneResult.rows[0]?.timezone);
			if (!dbTimezone) {
				throw new Error("Failed to retrieve database timezone");
			}

			return {
				status: "ok",
				timestamp: new Date().toISOString(),
				dbTimezone,
				backendTimezone,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown database error";
			throw new Error(errorMessage);
		}
	});

export const openApiRouter = {
	health: healthCheck,
	v1: {
		team: teamRouter,
	},
};
