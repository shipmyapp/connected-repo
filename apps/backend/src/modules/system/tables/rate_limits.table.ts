import { BaseTable } from "@backend/db/base_table";

/**
 * Token Bucket rate-limit store — exactly one row per bucket key.
 * `checkAndRecordRateLimit` (see rate_limit.service.ts) uses optimistic locking
 * to refill tokens based on time elapsed and consume 1 token per request.
 *
 * Storage growth depends on the key space:
 * - Bounded key spaces (user id, team id, teamApi id): 1 row per active
 *   actor. No cleanup cron job is required.
 * - High-cardinality key spaces (e.g. per-IP buckets like "login:ip:*"):
 *   rows accumulate one-per-unique-IP indefinitely. A periodic reaper is
 *   recommended, deleting rows where `lastUpdatedAt < now - windowSeconds*2`
 *   (i.e. buckets that have fully refilled and are safe to drop).
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
