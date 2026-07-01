import { isSystemContext, requestContext } from "@backend/lib/request-context";
import { logger } from "@backend/utils/logger.utils";

/**
 * Cluster-wide singleton handler exemplar. Two boilerplate patterns are on
 * display here:
 *
 *   1. `singletonKey` on the task definition (see events.schema.ts) means
 *      only one worker in the fleet runs this at a time.
 *
 *   2. The handler runs OUTSIDE a real request — no session, no active team
 *      member. We open an AsyncLocalStorage scope with the `"system"`
 *      sentinel so tenant-scoped `setOnCreate` hooks + default scopes
 *      have a context to read from, and any authz check downstream can
 *      distinguish user actions from system actions via `isSystemContext`.
 *
 * A real implementation would iterate every tenant and roll up stats.
 * Kept as a stub — the boilerplate ships the pattern, not the business.
 */
export const tenantStatsRollupHandler = async ({
	input,
}: {
	name: string;
	input: {
		triggeredAt: number;
	};
}) => {
	// System-scoped context. `tenantTeamId` and `teamMemberId` are the
	// `"system"` sentinel — no real tenant/actor to attribute to. Any
	// downstream authz gate MUST reject `role === "system"` explicitly
	// rather than fall through to an allow branch; treating the sentinel
	// as Owner/Admin would silently privilege the worker.
	await requestContext.run(
		{
			tenantTeamId: "system",
			userId: "system",
			teamMemberId: "system",
			teamMemberRole: "system",
		},
		async () => {
			const ctx = requestContext.getStore();
			if (!isSystemContext(ctx)) {
				// Guard against future refactors that stop wrapping in the
				// system sentinel — a silent tenant-scoped run would be
				// worse than an obvious error.
				throw new Error(
					"tenantStatsRollupHandler must run with a system context",
				);
			}

			logger.info(
				{ triggeredAt: input.triggeredAt },
				"[system.tenant_stats_rollup] running under system context",
			);

			// Business logic goes here. Cross-tenant reads should bypass the
			// default tenant scope explicitly:
			//   await db.journalEntries.unscope('default').where({ ... })
		},
	);
};
