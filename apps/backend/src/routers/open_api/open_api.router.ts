import { db } from "@backend/db/db";
import { journalEntriesOpenApiRouter } from "@backend/modules/journal-entries/journal-entries.openapi.router";
import { subscriptionOpenApiRouter } from "@backend/modules/subscriptions/subscription.router";
import { openApiPublicProcedure } from "@backend/procedures/open_api_public.procedure";
import * as z from "zod";
import { teamRouter } from "./team.router";

// Health check endpoint for OpenAPI (public - no auth required)
const healthCheck = openApiPublicProcedure
	.route({ method: "GET", path: "/health", tags: ["Health"] })
	.output(
		z.object({
			status: z.string(),
			timestamp: z.string(),
			error: z.string().optional(),
		})
	)
	.handler(async () => {
		try {
			// Test database connection by running a simple query
			await db.$query`SELECT 1`;

			return {
				status: "ok",
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown database error";
			return {
				status: "error",
				timestamp: new Date().toISOString(),
				error: errorMessage,
			};
		}
	});

export const openApiRouter = {
	health: healthCheck,
	v1: {
		"journal-entries": journalEntriesOpenApiRouter,
		subscriptions: subscriptionOpenApiRouter,
		team: teamRouter,
	},
};
