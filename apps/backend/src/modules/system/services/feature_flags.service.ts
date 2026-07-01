import { db } from "@backend/db/db";
import type {
	FeatureFlagListInput,
	FeatureFlagSelectAll,
	FeatureFlagSetInput,
} from "@connected-repo/zod-schemas/feature_flag.zod";

/**
 * Resolve a feature flag for the caller.
 *
 * Precedence:
 *   1. team override (key, scope="team",   scopeId=teamId) — if teamId is
 *      provided and the row exists, its `enabled` wins.
 *   2. global row   (key, scope="global", scopeId=null)    — if no team
 *      override or teamId is undefined.
 *   3. `defaultValue` (default `false`) — no row found.
 *
 * **Fail-safe default:** unknown keys resolve to `false`. Guards written as
 *   if (!(await isFeatureEnabled("autonomous.auto_merge_enabled", teamId))) {
 *     throw new ORPCError("FORBIDDEN", ...);
 *   }
 * will therefore keep a new-and-not-yet-flipped feature OFF until someone
 * flips it on explicitly. A typo in the key stays OFF as well.
 *
 * Cheap enough to call inline in a request path — the (key, scope, scopeId)
 * unique index makes each lookup a single-row primary-key hit.
 */
export const isFeatureEnabled = async (
	key: string,
	teamId?: string | null,
	defaultValue = false,
): Promise<boolean> => {
	if (teamId) {
		const teamRow = await db.featureFlags
			.where({ key, scope: "team", scopeId: teamId })
			.takeOptional();
		if (teamRow) return teamRow.enabled;
	}

	const globalRow = await db.featureFlags
		.where({ key, scope: "global", scopeId: null })
		.takeOptional();
	if (globalRow) return globalRow.enabled;

	return defaultValue;
};

/**
 * Upsert a flag row keyed by (key, scope, scopeId).
 *
 * Insert if new, else update `enabled` + `notes`. Idempotent — safe to call
 * from a UI toggle handler without race concerns; the unique index absorbs
 * concurrent writes.
 */
export const setFeatureFlag = async (
	input: FeatureFlagSetInput,
): Promise<FeatureFlagSelectAll> => {
	return await db.featureFlags
		.create({
			key: input.key,
			scope: input.scope,
			scopeId: input.scopeId,
			enabled: input.enabled,
			notes: input.notes ?? null,
		})
		.onConflict(["key", "scope", "scopeId"])
		.merge(["enabled", "notes"]);
};

/**
 * List flags, optionally filtered. Uses the same (key, scope, scopeId)
 * index the read path uses, so filtered scans stay plan-only.
 */
export const listFeatureFlags = async (
	filter: FeatureFlagListInput,
): Promise<FeatureFlagSelectAll[]> => {
	let q = db.featureFlags.all();
	if (filter.key) q = q.where({ key: filter.key });
	if (filter.scope) q = q.where({ scope: filter.scope });
	if (filter.scopeId !== undefined) q = q.where({ scopeId: filter.scopeId });
	return await q.order({ key: "ASC", scope: "ASC" });
};

/**
 * Hard-delete a flag row. Deleting a team override falls the resolver back
 * to the global row (if any); deleting the global row falls it back to the
 * caller-supplied default.
 */
export const deleteFeatureFlag = async (id: string): Promise<void> => {
	await db.featureFlags.find(id).delete();
};
