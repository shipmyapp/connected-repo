import { db } from "@backend/db/db";
import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import { journalEntriesOpenApiRouter } from "@backend/modules/journal-entries/journal-entries.openapi.router";
import { subscriptionOpenApiRouter } from "@backend/modules/subscriptions/subscription.router";
import {
	type OpenApiContextWithHeaders,
	openApiPublicProcedure,
} from "@backend/procedures/open_api_public.procedure";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import { zTimezone } from "@connected-repo/zod-schemas/zod_utils";
import * as z from "zod";
import { teamApiRouter } from "./team_api.router";

// Health check endpoint for OpenAPI (public - no auth required)
const healthCheck = openApiPublicProcedure
	.use(
		createRateLimitMiddleware<OpenApiContextWithHeaders>({
			bucketFn: (ctx) => ({
				key: `public:ip:${getClientIpAddress(ctx.reqHeaders)}`,
				limit: 60,
				windowSeconds: 60,
			}),
			label: "public",
		}),
	)
	.route({ method: "GET", tags: ["Health"] })
	.output(
		z.object({
			status: z.string(),
			timestamp: z.string(),
			dbTimezone: z.string().min(1),
			backendTimezone: z.string().min(1),
		}),
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
		"journal-entries": journalEntriesOpenApiRouter,
		subscriptions: subscriptionOpenApiRouter,
		team: teamApiRouter,
	},
};
