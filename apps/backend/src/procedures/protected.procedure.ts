import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { requestContext } from "@backend/lib/request-context";
import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import { rpcAuthMiddleware } from "@backend/modules/auth/auth.middleware";
import type { ActiveSessionSelectAll } from "@backend/modules/auth/tables/session.auth.table";
import { getTeamIdBySlugService } from "@backend/modules/teams/services/branding.teams.service";
import {
	type RpcContextWithHeaders,
	rpcPublicProcedure,
} from "@backend/procedures/public.procedure";
import type { TeamMemberRole } from "@connected-repo/zod-schemas/enums.zod";
import { resolveTenantSlug } from "@connected-repo/zod-schemas/tenant.utils";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";
import { ORPCError } from "@orpc/server";

/**
 * @public
 */
export interface RpcAuthenticatedContext extends RpcContextWithHeaders {
	session: ActiveSessionSelectAll;
	user: UserSelectAll;
}

export interface RpcActiveTeamContext extends RpcAuthenticatedContext {
	user: Omit<UserSelectAll, "activeTeamAppId"> & { activeTeamAppId: string };
	activeTeamId: string;
	activeTeamMemberId: string;
	activeTeamMemberRole: TeamMemberRole;
}

/**
 * Requires a valid session, whatever state the account is in. Only for the
 * few procedures a person whose account is scheduled for deletion may still
 * call (`account.cancelDeletion`). Everything else uses
 * `rpcProtectedProcedure`.
 *
 * Every authenticated call is charged once to `app:user:<id>` (300 per
 * minute, refilling 5 per second): it caps a runaway client or script, not
 * real traffic (the sync engine runs well under it). Redis down: the limit
 * lets calls through.
 */
export const rpcSessionProcedure = rpcPublicProcedure.use(rpcAuthMiddleware).use(
	createRateLimitMiddleware<RpcAuthenticatedContext>({
		bucketFn: (ctx) => ({
			key: `app:user:${ctx.user.id}`,
			limit: 300,
			windowSeconds: 60,
		}),
		label: "app",
	}),
);

/**
 * Requires a valid session on an account that is not scheduled for deletion.
 * The flag rides the session (a Better Auth user field), so this costs no
 * read; the cookie copy can be up to five minutes old, and the deletion
 * request ends every other session anyway.
 */
export const rpcProtectedProcedure = rpcSessionProcedure.use(({ context, next }) => {
	if (context.user.deletionRequestedAt !== null) {
		throw new ORPCError("ACCOUNT_DELETION_PENDING", {
			status: 403,
			message: "This account is scheduled for deletion. Keep the account to use the app again.",
			data: { deletionRequestedAt: context.user.deletionRequestedAt },
		});
	}
	return next({ context });
});

/**
 * Requires a valid session + the client to have explicitly selected an active
 * team via the `x-team-id` header. Looks up the matching team_members row and
 * runs the rest of the handler inside an AsyncLocalStorage scope carrying the
 * tenant identity — base-table `setOnCreate` hooks read this to auto-stamp
 * `teamId` and `createdByTeamMemberId` on every insert.
 * `x-team-id` is checked against the user row when Better Auth's cached
 * cookie copy disagrees (see the comment in the gate).
 *
 * The app:user rate limit is charged by rpcProtectedProcedure, before this gate.
 */
/**
 * The team whose own host sent this request, or null. `Origin` first (a
 * browser sends it on every cross-origin request and on every same-origin
 * POST, which is how oRPC's RPCLink calls); else `X-Forwarded-Host` / `Host`
 * (nginx forwards both, `apps/frontend/nginx.conf.template`). Null when
 * tenant mode is off, on the shared app host, and for mobile/bearer clients.
 */
async function tenantTeamIdForRequest(reqHeaders: Headers): Promise<string | null> {
	if (!env.TENANT_ROOT_DOMAIN) return null;
	let hostname: string | null = null;
	const origin = reqHeaders.get("origin");
	if (origin) {
		try {
			hostname = new URL(origin).hostname;
		} catch {
			hostname = null;
		}
	}
	hostname ??= reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host");
	if (!hostname) return null;
	const slug = resolveTenantSlug(hostname, env.TENANT_ROOT_DOMAIN);
	return slug ? await getTeamIdBySlugService(slug) : null;
}

export const rpcProtectedActiveTeamProcedure = rpcProtectedProcedure.use(
	async ({ context, next }) => {
		const headerTeamId = context.reqHeaders.get("x-team-id");
		if (!headerTeamId) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Active team id mismatch.",
			});
		}

		// `context.user` comes out of Better Auth's signed session cookie, a
		// copy of the user row up to five minutes old (`session.cookieCache` in
		// auth.config.ts). `teams.setActiveTeam` and `teams.getDefaultTeam` write
		// `users.activeTeamAppId` behind Better Auth's back, so right after a
		// team switch the copy names the previous team while the client (main
		// thread and DataWorker) already sends the new one. When the two
		// disagree the row decides, with one read that only the stale-cookie
		// window pays for.
		let activeTeamAppId = context.user.activeTeamAppId;
		if (activeTeamAppId !== headerTeamId) {
			const row = await db.users
				.where({ id: context.user.id })
				.select("activeTeamAppId")
				.takeOptional();
			activeTeamAppId = row?.activeTeamAppId ?? null;
		}

		// A team's own host (`<slug>.<root>`) is locked to that team and never
		// writes `users.activeTeamAppId` (ADR-039): its requests carry the
		// host's team in `x-team-id`. Accept it when the request comes from
		// that team's host; the membership check below is the authorisation,
		// so a forged Origin/Host grants nothing.
		if (activeTeamAppId !== headerTeamId) {
			const hostTeamId = await tenantTeamIdForRequest(context.reqHeaders);
			if (hostTeamId === headerTeamId) activeTeamAppId = headerTeamId;
		}

		if (!activeTeamAppId) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "User does not have an active team.",
			});
		}

		if (headerTeamId !== activeTeamAppId) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Active team id mismatch.",
			});
		}

		// Before the team request context exists: the scope is lifted, the
		// where names the team.
		const activeMember = await db.teamMembers
			.unscope("default")
			.where({
				teamId: activeTeamAppId,
				userId: context.user.id,
			})
			.takeOptional();

		if (!activeMember) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Not a member of this team.",
			});
		}

		return requestContext.run(
			{
				tenantTeamId: activeTeamAppId,
				userId: context.user.id,
				teamMemberId: activeMember.id,
				teamMemberRole: activeMember.role,
			},
			() =>
				next({
					context: {
						...context,
						user: { ...context.user, activeTeamAppId },
						activeTeamId: activeTeamAppId,
						activeTeamMemberId: activeMember.id,
						activeTeamMemberRole: activeMember.role,
					},
				}),
		);
	},
);

/** Active team + Owner/Admin role gate. */
export const rpcTeamOwnerAdminProcedure = rpcProtectedActiveTeamProcedure.use(
	({ context, next }) => {
		const role = context.activeTeamMemberRole;
		if (role !== "Owner" && role !== "Admin") {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Only Owner or Admin can perform this action",
			});
		}
		return next({ context });
	},
);
