import { db } from "@backend/db/db";
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

/**
 * Wave-1 anchor. Mints `topLevelSyncedAt = Date.now()` and returns it so
 * every downstream table pull in the same sync cycle can echo it back as
 * the snapshot ceiling.
 *
 * The scope is the intersection of `teamsApp` and `team_members` where
 * `userId` matches the caller — we ship the user's teams (all of them,
 * not just the active one) so the frontend can render its team picker
 * from the local cache.
 */
export async function pullTeamsAppService(
	input: TeamsAppPullBundlesInput,
	userId: string,
): Promise<TeamsAppPullBundlesOutput> {
	const topLevelSyncedAt = Date.now();

	const baseQuery = db.teamsApp
		.join("members")
		.where({ "members.userId": userId });

	const { data, syncMetadata } = await syncDeltaService<TeamAppSelectAll>({
		// biome-ignore lint/suspicious/noExplicitAny: the join narrows the base-query type in a way orchid's __scopes generic doesn't preserve; runtime shape is unchanged.
		baseQuery: baseQuery as any,
		syncMetadataInput: input.syncMetadata,
		topLevelSyncedAt,
		syncedTable: "teamsApp",
		isTopLevelAnchor: true,
	});

	return { rows: data, syncMetadata, topLevelSyncedAt };
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
			// biome-ignore lint/suspicious/noExplicitAny: same __scopes generic issue as above.
			baseQuery: baseQuery as any,
			syncMetadataInput: input.syncMetadata,
			topLevelSyncedAt: input.topLevelSyncedAt,
			syncedTable: "teamMembers",
		},
	);

	return { rows: data, syncMetadata };
}
