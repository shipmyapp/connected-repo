import { AsyncLocalStorage } from "node:async_hooks";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";

/**
 * Per-request tenant scope, propagated via AsyncLocalStorage. Set by
 * `rpcProtectedActiveTeamProcedure` for user requests, and by background
 * workers using the `"system"` sentinel for `teamMemberId`/`teamMemberRole`.
 *
 * Read by base-table `setOnCreate` hooks (see `db/base_table.ts`'s
 * `idAndAuditTimestamps`) to auto-stamp `teamId` + `createdByTeamMemberId` on
 * every insert — making it impossible to write a row without tenant identity.
 *
 * Any future authz check on `teamMemberRole` MUST reject `"system"` explicitly
 * rather than fall through to an allow branch; treating the sentinel as
 * Owner/Admin would silently privilege the worker.
 */
export interface RequestContext {
	tenantTeamId: string;
	userId: string;
	teamMemberId: string;
	teamMemberRole: TeamMemberRole | "system";
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
export const getRequestContext = () => requestContext.getStore();

/**
 * The team a tenant-scoped query belongs to. Throws outside a team request:
 * a query on a team-scoped table that has no team is a bug (it would read
 * every team). A deliberate cross-team query says so with
 * `.unscope("default")`.
 */
export const tenantTeamIdOrThrow = (table: string): string => {
	const ctx = requestContext.getStore();
	if (!ctx) {
		throw new Error(
			`${table} queried outside a team request: run it inside requestContext.run, or use .unscope("default") for a deliberate cross-team query`,
		);
	}
	return ctx.tenantTeamId;
};
