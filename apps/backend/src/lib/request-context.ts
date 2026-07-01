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
 * True when the current request context belongs to a server-side system actor
 * (background worker, seed, migration) rather than an authenticated user.
 *
 * The `"system"` sentinel is set only in code paths users cannot reach. The
 * protected procedure resolves `teamMemberId` from a `team_members` DB lookup
 * which can never produce the literal `"system"` (it's a 26-char ULID).
 *
 * Use this helper instead of inline `ctx?.teamMemberId === "system"` so every
 * system-bypass site is grep-able from one place.
 */
export const isSystemContext = (ctx: RequestContext | undefined): boolean =>
	ctx?.teamMemberId === "system";
