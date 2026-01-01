import { rpcAuthMiddleware } from "@backend/modules/auth/auth.middleware";
import type { ActiveSessionSelectAll } from "@backend/modules/auth/tables/session.auth.table";
import { type RpcContextWithHeaders, rpcPublicProcedure } from "@backend/procedures/public.procedure";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";

/**
 * @public
 */
export interface RpcAuthenticatedContext extends RpcContextWithHeaders {
  session: ActiveSessionSelectAll;
  user: UserSelectAll;
}

// Protected procedure - requires authentication
export const rpcProtectedProcedure = rpcPublicProcedure
  .use(rpcAuthMiddleware);
