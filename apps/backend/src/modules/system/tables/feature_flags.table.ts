import { BaseTable } from "@backend/db/base_table";
import type { FeatureFlagScope } from "@connected-repo/zod-schemas/enums.zod";

/**
 * Runtime feature flags — global kill-switches and per-team overrides.
 *
 * Resolution order at read time (see feature_flags.service.ts):
 *   1. If a teamId is supplied → prefer the (key, "team", teamId) row.
 *   2. Else → fall back to the (key, "global", null) row.
 *   3. Else → the caller's `defaultValue` (defaults to `false`, so unknown
 *      keys stay OFF).
 *
 * Not a tenant-scoped domain table — flags are metadata about tenants, not
 * tenant-owned data. No default scope; super-admin writes only.
 */
export class FeatureFlagTable extends BaseTable {
	readonly table = "feature_flags";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			key: t.string(200),
			scope: t.string(16).narrowType((c) => c<FeatureFlagScope>()),
			// `scopeId` is the teamId for scope="team", null for scope="global".
			// Kept as `t.string(26)` (ULID) with no FK so a team deletion
			// leaves the row for post-mortem; the periodic reconciler can
			// prune orphans if needed.
			scopeId: t.string(26).nullable(),
			enabled: t.boolean().default(false),
			notes: t.string(1000).nullable(),
			...t.timestampsAsNumbers(),
		}),
		(t) => [
			// One flag per (key, scope, scopeId). Global rows have scopeId
			// NULL — Postgres treats NULLs as distinct in unique indexes by
			// default, so `nullsNotDistinct` is required to prevent two
			// global rows for the same key.
			t.unique(["key", "scope", "scopeId"], {
				name: "feature_flags_key_scope_scope_id_idx",
				nullsNotDistinct: true,
			}),
			// Read-side index — every isFeatureEnabled() call does exactly
			// this predicate shape.
			t.index(["key", "scope", "scopeId"]),
		],
	);
}
