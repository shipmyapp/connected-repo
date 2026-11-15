import { BaseTable } from "@backend/db/base_table";

/**
 * @deprecated No longer read or written: rate limits live in Redis since
 * ADR-016 (`modules/system/services/rate_limit.service.ts`).
 * The class stays registered in `db.ts` so `yarn db g` does not generate a
 * drop in this release (expand/contract, backend ADR-B01). A later release
 * removes this class, its `db.ts` entry, and drops the table in a migration.
 */
export class RateLimitTable extends BaseTable {
	readonly table = "rate_limits";

	columns = this.setColumns((t) => ({
		id: t.ulidWithDefault().primaryKey(),
		// Opaque bucket key produced by the caller
		key: t.string(255).unique(),
		// Current tokens remaining in the bucket
		tokens: t.doublePrecision(),
		// Timestamp (epoch milliseconds) of the last update
		lastUpdatedAt: t.timestampNumber(),
	}));
}
