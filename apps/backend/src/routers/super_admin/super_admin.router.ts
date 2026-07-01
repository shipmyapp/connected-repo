import {
	deleteFeatureFlag,
	listFeatureFlags,
	setFeatureFlag,
} from "@backend/modules/system/services/feature_flags.service";
import { rpcSuperAdminProcedure } from "@backend/procedures/super_admin.procedure";
import {
	featureFlagDeleteInputZod,
	featureFlagListInputZod,
	featureFlagSelectAllZod,
	featureFlagSetInputZod,
} from "@connected-repo/zod-schemas/feature_flag.zod";
import type {
	InferRouterInputs,
	InferRouterOutputs,
	RouterClient,
} from "@orpc/server";
import { z } from "zod";

/**
 * Super-admin router. Add admin-only endpoints here. The procedure gate is
 * configured via `SUPER_ADMIN_EMAILS` / `SUPER_ADMIN_PHONE_NUMBERS` env vars
 * — see `procedures/super_admin.procedure.ts`.
 */

const ping = rpcSuperAdminProcedure
	.route({ method: "GET", tags: ["SuperAdmin"] })
	.output(
		z.object({
			ok: z.literal(true),
			user: z.object({
				id: z.string(),
				email: z.string().nullable(),
			}),
		}),
	)
	.handler(({ context: { user } }) => {
		return {
			ok: true as const,
			user: { id: user.id, email: user.email ?? null },
		};
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
	.handler(async ({ input }) => {
		return await setFeatureFlag(input);
	});

const deleteFlag = rpcSuperAdminProcedure
	.route({ method: "DELETE", tags: ["SuperAdmin"] })
	.input(featureFlagDeleteInputZod)
	.output(z.object({ ok: z.literal(true) }))
	.handler(async ({ input }) => {
		await deleteFeatureFlag(input.id);
		return { ok: true as const };
	});

export const superAdminRouter = {
	ping,
	listFlags,
	setFlag,
	deleteFlag,
};

export type SuperAdminRouter = RouterClient<typeof superAdminRouter>;
export type SuperAdminRouterInputs = InferRouterInputs<typeof superAdminRouter>;
export type SuperAdminRouterOutputs = InferRouterOutputs<
	typeof superAdminRouter
>;
