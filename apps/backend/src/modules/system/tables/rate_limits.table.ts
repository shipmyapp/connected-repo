import { BaseTable } from "@backend/db/base_table";

/**
 * Token Bucket rate-limit store — exactly one row per bucket key.
 * `checkAndRecordRateLimit` (see rate_limit.service.ts) uses optimistic locking
 * to refill tokens based on time elapsed and consume 1 token per request.
 * 
 * Storage is strictly 1 row per active user/actor. No cleanup cron job is required.
 */
export class RateLimitTable extends BaseTable {
	readonly table = "rate_limits";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			// Opaque bucket key produced by the caller
			key: t.string(255).unique(),
			// Current tokens remaining in the bucket
			tokens: t.doublePrecision(),
			// Timestamp (epoch milliseconds) of the last update
			lastUpdatedAt: t.timestampNumber(),
		})
	);
}
