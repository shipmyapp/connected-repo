import { rpcSuperAdminProcedure } from "@backend/procedures/super_admin.procedure";
import type { InferRouterInputs, InferRouterOutputs, RouterClient } from "@orpc/server";
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
		return { ok: true as const, user: { id: user.id, email: user.email ?? null } };
	});

export const superAdminRouter = {
	ping,
};

export type SuperAdminRouter = RouterClient<typeof superAdminRouter>;
export type SuperAdminRouterInputs = InferRouterInputs<typeof superAdminRouter>;
export type SuperAdminRouterOutputs = InferRouterOutputs<typeof superAdminRouter>;
