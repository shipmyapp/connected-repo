import { z } from "zod";
import { featureFlagScopeZod } from "./enums.zod.js";
import { zString, zTimestampsAsNumbers } from "./zod_utils.js";

/**
 * Feature-flag shape. A flag is uniquely identified by (key, scope, scopeId):
 *   - scope="global", scopeId=null     → applies to everyone unless a team
 *                                         override exists
 *   - scope="team",   scopeId=teamId   → per-team override that beats the
 *                                         global row for that team
 *
 * Runtime resolution (see modules/system/services/feature_flags.service.ts):
 *   isFeatureEnabled(key, teamId?)
 *     1. If teamId is passed → look up (key, "team", teamId). Return its
 *        `enabled` if it exists.
 *     2. Else → look up (key, "global", null). Return its `enabled` if it
 *        exists.
 *     3. Else → return the `defaultValue` argument (default `false`).
 *
 * Default-false-when-missing keeps unknown flags SAFE — a typo in the flag
 * name means the guarded code path stays off, not on.
 */
export const featureFlagSelectAllZod = z.object({
	id: z.ulid(),
	key: zString.min(1).max(200),
	scope: featureFlagScopeZod,
	scopeId: z.ulid().nullable(),
	enabled: z.boolean(),
	notes: zString.max(1000).nullable(),
}).extend(zTimestampsAsNumbers);
export type FeatureFlagSelectAll = z.infer<typeof featureFlagSelectAllZod>;

export const featureFlagSetInputZod = z.object({
	key: zString.min(1).max(200),
	scope: featureFlagScopeZod,
	scopeId: z.ulid().nullable(),
	enabled: z.boolean(),
	notes: zString.max(1000).nullable().optional(),
}).refine(
	(v) => (v.scope === "global" ? v.scopeId === null : v.scopeId !== null),
	{
		message: "scopeId must be null for scope=global and a ulid for scope=team",
		path: ["scopeId"],
	},
);
export type FeatureFlagSetInput = z.infer<typeof featureFlagSetInputZod>;

export const featureFlagListInputZod = z.object({
	key: zString.optional(),
	scope: featureFlagScopeZod.optional(),
	scopeId: z.ulid().nullable().optional(),
});
export type FeatureFlagListInput = z.infer<typeof featureFlagListInputZod>;

export const featureFlagDeleteInputZod = z.object({
	id: z.ulid(),
});
export type FeatureFlagDeleteInput = z.infer<typeof featureFlagDeleteInputZod>;
