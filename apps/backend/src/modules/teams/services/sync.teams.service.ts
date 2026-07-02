import { db } from "@backend/db/db";
import { getRequestContext } from "@backend/lib/request-context";
import { syncDeltaService } from "@backend/modules/sync/services/sync_delta.sync.service";
import type {
	TeamAppMemberSelectAll,
	TeamAppSelectAll,
} from "@connected-repo/zod-schemas/team_app.zod";
import type {
	TeamMembersPullBundlesInput,
	TeamMembersPullBundlesOutput,
	TeamsAppPullBundlesInput,
	TeamsAppPullBundlesOutput,
} from "@connected-repo/zod-schemas/teams/sync";
import { ORPCError } from "@orpc/server";

// ─────────────────────────────────────────────────────────────────────────────
// Wave-1 anchor — full snapshot at team grain.
//
// Mints `topLevelSyncedAt = Date.now()` and returns it so every downstream
// table pull in the same sync cycle can echo it back as the snapshot ceiling.
//
// No cursor pagination: per-user team counts are bounded (typically O(10))
// and the join with team_members on every call is cheap. A full snapshot
// also collapses the "user was added to a pre-existing team" case — the join
// naturally picks up the new team without a separate reconciliation query.
//
// The scope is `teamsApp` intersected with `team_members` where `userId`
// matches the caller — we ship the user's teams (all of them, not just the
// active one) so the frontend can render its team picker from the local
// cache. Soft-deleted team rows are included as tombstones so the client
// can evict them.
// ─────────────────────────────────────────────────────────────────────────────

export async function pullTeamsAppService(
	input: TeamsAppPullBundlesInput,
	userId: string,
): Promise<TeamsAppPullBundlesOutput> {
	const ctx = getRequestContext();
	if (!ctx) {
		throw new ORPCError("UNAUTHORIZED", {
			status: 401,
			message: "No active session context",
		});
	}
	const teamId = ctx.tenantTeamId;

	if (input.syncMetadata?.teamId && teamId !== input.syncMetadata.teamId) {
		throw new ORPCError("BAD_REQUEST", {
			status: 400,
			message: "Active team id mismatched with sync metadata cursor",
		});
	}

	const topLevelSyncedAt = Date.now();

	// Join with team_members to scope to the caller; `includeDeleted()` on
	// the team side preserves soft-deleted team rows so the client can evict
	// them from the local cache.
	const memberships = await db.teamMembers
		.unscope("default")
		.select({ team: (q) => q.team.includeDeleted().selectAll() })
		.where({ userId });

	const rows = memberships
		.map((m) => m.team)
		.filter((t): t is NonNullable<typeof t> => t != null) as TeamAppSelectAll[];

	return {
		rows,
		syncMetadata: {
			teamId,
			syncedTable: "teamsApp",
			fromCursorId: null,
			fromCursorUpdatedAt: null,
			toCursorId: null,
			toCursorUpdatedAt: null,
			syncedAt: topLevelSyncedAt,
			totalRecords: rows.length,
		},
		topLevelSyncedAt,
	};
}

/**
 * Downstream anchor. Scoped by the active tenant team via TeamMemberTable's
 * default scope — no explicit teamId filter needed.
 */
export async function pullTeamMembersService(
	input: TeamMembersPullBundlesInput,
): Promise<TeamMembersPullBundlesOutput> {
	const baseQuery = db.teamMembers;

	const { data, syncMetadata } = await syncDeltaService<TeamAppMemberSelectAll>(
		{
			// biome-ignore lint/suspicious/noExplicitAny: __scopes generic is not preserved through the ORM chain.
			baseQuery: baseQuery as any,
			syncMetadataInput: input.syncMetadata,
			topLevelSyncedAt: input.topLevelSyncedAt,
			syncedTable: "teamMembers",
		},
	);

	return { rows: data, syncMetadata };
}
