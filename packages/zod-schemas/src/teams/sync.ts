import { z } from "zod";
import { syncDeltaInputZod, syncMetadataZod } from "../sync.zod.js";
import { teamAppMemberSelectAllZod, teamAppSelectAllZod } from "../team_app.zod.js";
import { zTimeEpoch } from "../zod_utils.js";

// ─── Wave-1 anchor ──────────────────────────────────────────────────────────
//
// `teams.pullBundles` mints `topLevelSyncedAt` as `Date.now()` and returns it
// alongside its own rows. Every downstream table pull in the same cycle
// echoes this value back so the whole cycle sees a consistent snapshot
// ceiling.

export const teamsAppPullBundlesInputZod = z.object({
	syncMetadata: syncMetadataZod.nullish(),
});
export type TeamsAppPullBundlesInput = z.infer<typeof teamsAppPullBundlesInputZod>;

export const teamsAppPullBundlesOutputZod = z.object({
	rows: z.array(teamAppSelectAllZod),
	syncMetadata: syncMetadataZod,
	topLevelSyncedAt: zTimeEpoch,
});
export type TeamsAppPullBundlesOutput = z.infer<typeof teamsAppPullBundlesOutputZod>;

// ─── Downstream anchors ─────────────────────────────────────────────────────

export const teamMembersPullBundlesInputZod = syncDeltaInputZod;
export type TeamMembersPullBundlesInput = z.infer<typeof teamMembersPullBundlesInputZod>;

export const teamMembersPullBundlesOutputZod = z.object({
	rows: z.array(teamAppMemberSelectAllZod),
	syncMetadata: syncMetadataZod,
});
export type TeamMembersPullBundlesOutput = z.infer<typeof teamMembersPullBundlesOutputZod>;
