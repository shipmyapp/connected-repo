import { TeamSelectAll } from "@connected-repo/zod-schemas/team.zod";
import { os } from "@orpc/server";
import { RequestHeadersPluginContext } from "@orpc/server/plugins";

export interface OpenApiContext extends RequestHeadersPluginContext {
	"x-team-id"?: string;
  "x-api-key"?: string;
  team?: TeamSelectAll;
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