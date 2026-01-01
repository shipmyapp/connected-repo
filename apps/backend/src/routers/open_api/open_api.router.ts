import { db } from "@backend/db/db";
import { openApiPublicProcedure } from "@backend/procedures/open_api_public.procedure";
import * as z from "zod";
import { teamRouter } from "./team.router";

// Health check endpoint for OpenAPI (public - no auth required)
const healthCheck = openApiPublicProcedure
	.route({ method: "GET", path: "/health" })
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
		team: teamRouter,
	},
};
