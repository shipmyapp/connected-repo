import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";

export interface RateLimitCheckResult {
	allowed: boolean;
	/** Number of hits mathematically implied by the missing tokens. */
	currentCount: number;
	/** Configured ceiling. */
	limit: number;
	/** Seconds until a full token is regenerated. */
	retryAfterSeconds: number;
}

/**
 * Debounced high-contention warning. When the optimistic-lock retry loop
 * exhausts for a given bucket, we log at most once per key per 60s to avoid
 * flooding the log stream during hot-loop contention (which by design causes
 * many rapid retries per second).
 *
 * Map is process-local — good enough for observability signal ("this key is
 * hot"); not a strict distributed guarantee. Bounded by unique-keys-per-60s,
 * with periodic pruning below.
 */
const EXHAUSTION_LOG_DEBOUNCE_MS = 60_000;
const exhaustionLastLoggedAt = new Map<string, number>();

const logExhaustionOncePerMinute = (
	key: string,
	limit: number,
	windowSeconds: number,
	retries: number,
): void => {
	const now = Date.now();
	const last = exhaustionLastLoggedAt.get(key);
	if (last !== undefined && now - last < EXHAUSTION_LOG_DEBOUNCE_MS) return;
	exhaustionLastLoggedAt.set(key, now);

	// Opportunistic prune to keep the Map bounded when the process serves many
	// distinct hot keys over time. O(n) but only runs when we would have logged.
	if (exhaustionLastLoggedAt.size > 1000) {
		for (const [k, t] of exhaustionLastLoggedAt) {
			if (now - t >= EXHAUSTION_LOG_DEBOUNCE_MS) exhaustionLastLoggedAt.delete(k);
		}
	}

	logger.info(
		{ key, limit, windowSeconds, retries },
		"[rateLimit] high contention — optimistic-lock retries exhausted (debounced 60s per key)",
	);
};

/**
 * Token Bucket rate limiter — Postgres-backed with optimistic locking.
 *
 * Semantics: each `key` holds a bucket of `tokens`. The bucket regenerates
 * continuously at a rate of `limit / windowSeconds` up to a maximum of
 * `limit`. Every request costs 1 token.
 *
 * Storage: EXACTLY ONE row per key. Zero ongoing cleanup required.
 */
export const checkAndRecordRateLimit = async (
	key: string,
	limit: number,
	windowSeconds: number,
): Promise<RateLimitCheckResult> => {
	const rate = limit / windowSeconds; // tokens per second
	const MAX_RETRIES = 5;

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const current = await db.rateLimits.findByOptional({ key });
		const now = Date.now();

		if (!current) {
			try {
				await db.rateLimits.create({
					key,
					tokens: limit - 1,
					lastUpdatedAt: new Date(now),
				});
				return {
					allowed: true,
					currentCount: 1,
					limit,
					retryAfterSeconds: 0,
				};
			} catch (err: any) {
				// 23505 = unique_violation in Postgres
				if (err.code === "23505") continue;
				throw err;
			}
		}

		// Bucket exists. Calculate how many tokens regenerated since last update.
		const elapsedSeconds = (now - current.lastUpdatedAt) / 1000;
		// Do not exceed the max capacity of the bucket (`limit`)
		const currentTokens = Number(current.tokens);
		const tokens = Math.min(limit, currentTokens + elapsedSeconds * rate);

		if (tokens < 1) {
			// Rate limited. How long until we reach exactly 1 token?
			const retryAfterSeconds = Math.max(1, Math.ceil((1 - tokens) / rate));
			return {
				allowed: false,
				currentCount: limit, // Bucket is effectively empty
				limit,
				retryAfterSeconds,
			};
		}

		// Optimistic lock: only update if `lastUpdatedAt` hasn't changed
		// (i.e. no other concurrent request has updated this row since our select).
		const updatedCount = await db.rateLimits
			.where({
				key,
				lastUpdatedAt: new Date(current.lastUpdatedAt),
			})
			.update({
				tokens: tokens - 1,
				lastUpdatedAt: new Date(now),
			});

		if (updatedCount === 0) {
			// Another request updated this bucket right between our SELECT and UPDATE.
			// Retry the cycle.
			continue;
		}

		return {
			allowed: true,
			currentCount: Math.ceil(limit - (tokens - 1)),
			limit,
			retryAfterSeconds: 0,
		};
	}

	logger.warn({ key, limit, windowSeconds, retries: MAX_RETRIES }, "[rateLimit] optimistic lock exhausted — shedding as rate-limited");
	logExhaustionOncePerMinute(key, limit, windowSeconds, MAX_RETRIES);
	return { allowed: false, currentCount: limit, limit, retryAfterSeconds: 1 };
};
