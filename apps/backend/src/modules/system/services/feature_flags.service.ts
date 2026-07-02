import { db } from "@backend/db/db";
import type {
	FeatureFlagListInput,
	FeatureFlagSelectAll,
	FeatureFlagSetInput,
} from "@connected-repo/zod-schemas/feature_flag.zod";

const TTL_MS = 5_000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();

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
 * **Fail-safe default (opt-in features):** unknown keys resolve to `false`.
 * Guards written as
 *   if (!(await isFeatureEnabled("autonomous.auto_merge_enabled", teamId))) {
 *     throw new ORPCError("FORBIDDEN", ...);
 *   }
 * will therefore keep a new-and-not-yet-flipped feature OFF until someone
 * flips it on explicitly. A typo in the key stays OFF as well.
 *
 * **Default-true kill-switch pattern:** for a feature that should be ON in
 * normal operation and only killed during incidents, pass `defaultValue=true`
 * so absence of any row means "on". Real example — the subscription alert
 * webhook enqueue guard in
 * `modules/subscriptions/services/increment_usage.subscriptions.service.ts`:
 *
 *   const webhookEnabled = await isFeatureEnabled(
 *     "subscriptions.alert_webhook_enabled",
 *     teamId,       // nullable — falls back to the global row
 *     true,         // default ON; super-admin flips off to kill-switch
 *   );
 *   if (!webhookEnabled) { logger.info(...); return; }
 *
 * A super-admin can then create a global row `enabled=false` to stop the whole
 * system from firing outbound webhooks during an incident, or a
 * `scope="team", scopeId=<teamId>` row to disable one abusive tenant while
 * leaving the rest on. The guard sits at the CALL site of the risky action
 * (the tbus enqueue) — never on the flag CRUD itself. See the docstring block
 * in `routers/super_admin/super_admin.router.ts` for the write-side pattern.
 *
 * **In-process TTL cache (5s):** resolved values are memoized per
 * (key, teamId, defaultValue) tuple for `TTL_MS` (5 seconds) to avoid a
 * per-request DB tax on hot paths. The cache is fully invalidated whenever
 * `setFeatureFlag` or `deleteFeatureFlag` runs in this process. The cache is
 * per-Node-process — in a multi-instance deployment each instance keeps its
 * own map, so a super-admin flag flip propagates independently on each
 * instance within at most 5 seconds of the write on that instance.
 */
export const isFeatureEnabled = async (
	key: string,
	teamId?: string | null,
	defaultValue = false,
): Promise<boolean> => {
	const cacheKey = `${key}::${teamId ?? "global"}::${defaultValue}`;
	const now = Date.now();
	const cached = cache.get(cacheKey);
	if (cached && cached.expiresAt > now) {
		return cached.value;
	}

	let resolved: boolean;
	if (teamId) {
		const teamRow = await db.featureFlags
			.where({ key, scope: "team", scopeId: teamId })
			.takeOptional();
		if (teamRow) {
			resolved = teamRow.enabled;
			cache.set(cacheKey, { value: resolved, expiresAt: now + TTL_MS });
			return resolved;
		}
	}

	const globalRow = await db.featureFlags
		.where({ key, scope: "global", scopeId: null })
		.takeOptional();
	if (globalRow) {
		resolved = globalRow.enabled;
	} else {
		resolved = defaultValue;
	}

	cache.set(cacheKey, { value: resolved, expiresAt: now + TTL_MS });
	return resolved;
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
	const result = await db.featureFlags
		.create({
			key: input.key,
			scope: input.scope,
			scopeId: input.scopeId,
			enabled: input.enabled,
			notes: input.notes ?? null,
		})
		.onConflict(["key", "scope", "scopeId"])
		.merge(["enabled", "notes"]);
	cache.clear();
	return result;
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
	cache.clear();
};
