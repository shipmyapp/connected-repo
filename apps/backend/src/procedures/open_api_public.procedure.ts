import type { TeamApiSelectAll } from "@connected-repo/zod-schemas/team_api.zod";
import { os } from "@orpc/server";
import { RequestHeadersPluginContext } from "@orpc/server/plugins";
import z from "zod";

export interface OpenApiContext extends RequestHeadersPluginContext {
	"x-team-id"?: string;
  "x-api-key"?: string;
  team?: TeamApiSelectAll;
}

export interface OpenApiContextWithHeaders extends OpenApiContext {
	reqHeaders: Headers;
}

const openApiBase = os.$context<OpenApiContext>()

export const openApiPublicProcedure = openApiBase
	.use(({ context, next }) => {
		const reqHeaders = context.reqHeaders ?? new Headers();
		// You can add any public middleware logic here if needed
		return next({ 
			context: {
				...context, 
				reqHeaders
			} 
		});
	})
	.errors({
		INPUT_VALIDATION_FAILED: {
			status: 422,
			data: z.object({
				formErrors: z.array(z.string()),
				fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
			}),
		},
		OUTPUT_VALIDATION_FAILED: {
			status: 500,
			data: z.object({
				formErrors: z.array(z.string()),
				fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
			}),
		},
		RATE_LIMITED: {
			status: 429,
		},
	});