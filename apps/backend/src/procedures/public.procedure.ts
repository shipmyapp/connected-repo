import type { ActiveSessionSelectAll } from "@backend/modules/auth/tables/session.auth.table";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";
import { os } from "@orpc/server";
import type { RequestHeadersPluginContext } from "@orpc/server/plugins";
import z from "zod";

/**
 * @public
 */
export interface RpcContext extends RequestHeadersPluginContext {
	session?: ActiveSessionSelectAll;
	user?: UserSelectAll;
}

export interface RpcContextWithHeaders extends RpcContext {
	reqHeaders: Headers;
}

const rpcBaseOrpc = os.$context<RpcContext>()

// Public procedure with context
export const rpcPublicProcedure = rpcBaseOrpc
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
