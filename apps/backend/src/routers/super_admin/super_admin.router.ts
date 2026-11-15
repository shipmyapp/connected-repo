import { db } from "@backend/db/db";
import {
	deleteFeatureFlag,
	listFeatureFlags,
	setFeatureFlag,
} from "@backend/modules/system/services/feature_flags.service";
import {
	listOperatorAudit,
	withOperatorAudit,
} from "@backend/modules/system/services/operator_audit.service";
import {
	getTeamForAdmin,
	listTeamsForAdmin,
} from "@backend/modules/teams/services/admin_teams.service";
import {
	countLiveSessionsForAdmin,
	listUsersForAdmin,
	revokeAllSessionsForAdmin,
} from "@backend/modules/users/services/admin_users.service";
import { rpcSuperAdminProcedure } from "@backend/procedures/super_admin.procedure";
import {
	featureFlagDeleteInputZod,
	featureFlagListInputZod,
	featureFlagSelectAllZod,
	featureFlagSetInputZod,
} from "@connected-repo/zod-schemas/feature_flag.zod";
import {
	superAdminAuditListInputZod,
	superAdminAuditListOutputZod,
	superAdminListInputZod,
	superAdminRevokeSessionsInputZod,
	superAdminTeamDetailZod,
	superAdminTeamListOutputZod,
	superAdminUserListOutputZod,
} from "@connected-repo/zod-schemas/super_admin.zod";
import {
	teamAppSelectAllZod,
	teamSlugAssignInputZod,
} from "@connected-repo/zod-schemas/team_app.zod";
import { type InferRouterOutputs, ORPCError, type RouterClient } from "@orpc/server";
import { z } from "zod";

/**
 * Super-admin router — served to the console (`apps/superadmin`) over oRPC
 * at `/api/super-admin` (request_handlers/super_admin_rpc.handler.ts) and
 * documented as OpenAPI at `/super-admin/`. Every procedure goes through
 * `rpcSuperAdminProcedure`: 401 signed out, 403 off the allowlist
 * (`SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_PHONE_NUMBERS`), 30 calls a minute.
 */

const ping = rpcSuperAdminProcedure
	.route({ method: "GET", tags: ["SuperAdmin"] })
	.output(
		z.object({
			ok: z.literal(true),
			user: z.object({
				id: z.string(),
				email: z.string().nullable(),
				name: z.string(),
			}),
		}),
	)
	.handler(({ context: { user } }) => {
		return {
			ok: true as const,
			user: { id: user.id, email: user.email ?? null, name: user.name },
		};
	});

// ─── Teams and users ────────────────────────────────────────────────────

const listTeams = rpcSuperAdminProcedure
	.route({ method: "GET", tags: ["SuperAdmin"] })
	.input(superAdminListInputZod)
	.output(superAdminTeamListOutputZod)
	.handler(async ({ input }) => await listTeamsForAdmin(input));

const getTeam = rpcSuperAdminProcedure
	.route({ method: "GET", tags: ["SuperAdmin"] })
	.input(z.object({ teamId: z.ulid() }))
	.output(superAdminTeamDetailZod)
	.handler(async ({ input: { teamId } }) => await getTeamForAdmin(teamId));

// The subdomain is the operator's to hand out: it needs the wildcard DNS
// record and certificate on their side, so the team sees it and never
// edits it (ADR-036). The partial unique index `teams_app_slug_idx` turns a
// clash into 23505, surfaced as CONFLICT.
const assignTeamSlug = rpcSuperAdminProcedure
	.route({ method: "POST", tags: ["SuperAdmin"] })
	.input(teamSlugAssignInputZod)
	.output(teamAppSelectAllZod)
	.handler(async ({ input: { teamId, slug }, context }) => {
		const team = await db.teamsApp.findOptional(teamId);
		if (!team) throw new ORPCError("NOT_FOUND", { status: 404, message: "Team not found" });
		try {
			// The value before, the change and the audit row share one
			// transaction, so a refused (23505) assignment leaves no row.
			return await withOperatorAudit(context, {
				action: "teams.assignSlug",
				targetKind: "team",
				targetId: teamId,
				before: async () => ({ slug: team.slug }),
				apply: async () => await db.teamsApp.find(teamId).selectAll().update({ slug }),
				after: (updated) => ({ slug: updated.slug }),
			});
		} catch (err) {
			if (slug && err instanceof Error && "code" in err && err.code === "23505") {
				throw new ORPCError("CONFLICT", {
					status: 409,
					message: `The subdomain "${slug}" is already taken.`,
				});
			}
			throw err;
		}
	});

const listUsers = rpcSuperAdminProcedure
	.route({ method: "GET", tags: ["SuperAdmin"] })
	.input(superAdminListInputZod)
	.output(superAdminUserListOutputZod)
	.handler(async ({ input }) => await listUsersForAdmin(input));

const revokeUserSessions = rpcSuperAdminProcedure
	.route({ method: "POST", tags: ["SuperAdmin"] })
	.input(superAdminRevokeSessionsInputZod)
	.output(z.object({ ended: z.number().int().min(0) }))
	.handler(async ({ input, context }) => {
		if (input.userId === context.user.id) {
			throw new ORPCError("BAD_REQUEST", {
				status: 400,
				message: "Use Sign out to end your own sessions.",
			});
		}
		const user = await db.users.findOptional(input.userId);
		if (!user) throw new ORPCError("NOT_FOUND", { status: 404, message: "User not found" });
		return await withOperatorAudit(context, {
			action: "users.revokeSessions",
			targetKind: "user",
			targetId: input.userId,
			reason: input.reason,
			before: async () => ({ liveSessions: await countLiveSessionsForAdmin(input.userId) }),
			apply: () => revokeAllSessionsForAdmin(input.userId),
		});
	});

// ─── Feature flags ──────────────────────────────────────────────────────
// Flag CRUD lives under super-admin because that's who toggles them for
// tenants. Flags themselves gate TENANT-FACING features — the guard call
// (`await isFeatureEnabled(key, teamId)`) belongs in the tenant-facing
// router that owns the guarded feature, NOT here. See the docstring on
// `isFeatureEnabled` in `services/feature_flags.service.ts` for the
// caller-side pattern.
//
// Flag write examples (super-admin frontend calls these):
//
//   Turn on globally for everyone:
//     POST /super-admin/setFlag  { key: "autonomous.auto_merge_enabled",
//                                  scope: "global", scopeId: null,
//                                  enabled: true }
//
//   Turn on for one team only:
//     POST /super-admin/setFlag  { key: "autonomous.auto_merge_enabled",
//                                  scope: "team", scopeId: "<teamId>",
//                                  enabled: true }
//
//   Force-disable one team when it's on globally:
//     POST /super-admin/setFlag  { key: "autonomous.auto_merge_enabled",
//                                  scope: "team", scopeId: "<teamId>",
//                                  enabled: false }

const listFlags = rpcSuperAdminProcedure
	.route({ method: "GET", tags: ["SuperAdmin"] })
	.input(featureFlagListInputZod)
	.output(z.array(featureFlagSelectAllZod))
	.handler(async ({ input }) => {
		return await listFeatureFlags(input);
	});

const setFlag = rpcSuperAdminProcedure
	.route({ method: "POST", tags: ["SuperAdmin"] })
	.input(featureFlagSetInputZod)
	.output(featureFlagSelectAllZod)
	.handler(async ({ input, context }) => {
		return await withOperatorAudit(context, {
			action: "flags.set",
			targetKind: "flag",
			targetId: `${input.key}@${input.scope}${input.scopeId ? `:${input.scopeId}` : ""}`,
			before: async () =>
				await db.featureFlags
					.where({ key: input.key, scope: input.scope, scopeId: input.scopeId })
					.takeOptional(),
			apply: () => setFeatureFlag(input),
		});
	});

const deleteFlag = rpcSuperAdminProcedure
	.route({ method: "DELETE", tags: ["SuperAdmin"] })
	.input(featureFlagDeleteInputZod)
	.output(z.object({ ok: z.literal(true) }))
	.handler(async ({ input, context }) => {
		return await withOperatorAudit(context, {
			action: "flags.delete",
			targetKind: "flag",
			targetId: input.id,
			before: async () => await db.featureFlags.findOptional(input.id),
			apply: async () => {
				await deleteFeatureFlag(input.id);
				return { ok: true as const };
			},
			after: () => null,
		});
	});

// ─── Audit ──────────────────────────────────────────────────────────────
// Every mutation above goes through `withOperatorAudit`; this reads the
// trail back, newest first.

const auditList = rpcSuperAdminProcedure
	.route({ method: "GET", tags: ["SuperAdmin"] })
	.input(superAdminAuditListInputZod)
	.output(superAdminAuditListOutputZod)
	.handler(async ({ input }) => await listOperatorAudit(input));

// Every procedure here that changes data wraps the change in
// `withOperatorAudit` (modules/system/services/operator_audit.service.ts).
export const superAdminRouter = {
	ping,
	listTeams,
	getTeam,
	assignTeamSlug,
	listUsers,
	revokeUserSessions,
	listFlags,
	setFlag,
	deleteFlag,
	auditList,
};

export type SuperAdminRouter = RouterClient<typeof superAdminRouter>;
export type SuperAdminRouterOutputs = InferRouterOutputs<typeof superAdminRouter>;
