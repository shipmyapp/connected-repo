import { getRedis } from "@backend/configs/redis.config";
import { logger } from "@backend/utils/logger.utils";

interface RateLimitCheckResult {
	allowed: boolean;
	/** Number of hits implied by the missing tokens. */
	currentCount: number;
	/** Configured ceiling. */
	limit: number;
	/** Seconds until a full token is regenerated. */
	retryAfterSeconds: number;
}

/**
 * Token-bucket rate limiting in Redis (supersedes ADR-010's Postgres table).
 *
 * Each key is a bucket of `limit` tokens that refills continuously over
 * `windowSeconds` (rate = limit / windowSeconds tokens per second); a request
 * costs one token. One Lua script reads, refills, spends and writes the bucket
 * atomically, so concurrent requests on several API replicas never race, and
 * the key expires once it would be full again, so nothing needs cleaning up.
 *
 * Redis key: `rl:<key>`, where `<key>` follows the `<scope>:<subject>:<id>`
 * convention of `middlewares/rate_limit.middleware.ts`.
 *
 * When Redis fails (down, timeout), the caller's rule applies: `failClosed`
 * refuses (for a limit that is the only guard on a guessable secret), anything
 * else is let through so a Redis outage never takes the app down.
 */
const BUCKET_SCRIPT = `
local limit = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local stored = redis.call('HMGET', KEYS[1], 't', 'at')
local tokens = tonumber(stored[1])
local at = tonumber(stored[2])
if tokens == nil then tokens = limit; at = now end
tokens = math.min(limit, tokens + ((now - at) / 1000) * rate)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HSET', KEYS[1], 't', tostring(tokens), 'at', tostring(now))
redis.call('PEXPIRE', KEYS[1], ttl)
return { allowed, tostring(tokens) }
`;

const KEY_PREFIX = "rl:";

const resultOf = (
	allowed: boolean,
	tokens: number,
	limit: number,
	rate: number,
): RateLimitCheckResult =>
	allowed
		? {
				allowed: true,
				currentCount: Math.ceil(limit - tokens),
				limit,
				retryAfterSeconds: 0,
			}
		: {
				allowed: false,
				currentCount: limit,
				limit,
				retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / rate)),
			};

/** A Redis outage would otherwise log once per request. */
const UNAVAILABLE_LOG_EVERY_MS = 60_000;
let lastUnavailableLogAt = 0;

export const checkAndRecordRateLimit = async (
	key: string,
	limit: number,
	windowSeconds: number,
	options: { failClosed?: boolean } = {},
): Promise<RateLimitCheckResult> => {
	const rate = limit / windowSeconds; // tokens per second
	try {
		const reply = await getRedis().eval(
			BUCKET_SCRIPT,
			1,
			`${KEY_PREFIX}${key}`,
			limit,
			rate,
			Date.now(),
			windowSeconds * 1000,
		);
		const [allowed, tokens] = Array.isArray(reply) ? reply : [0, "0"];
		return resultOf(Number(allowed) === 1, Number(tokens), limit, rate);
	} catch (error) {
		const now = Date.now();
		if (now - lastUnavailableLogAt >= UNAVAILABLE_LOG_EVERY_MS) {
			lastUnavailableLogAt = now;
			logger.warn(
				{ err: error, key, failClosed: options.failClosed === true },
				"[rateLimit] Redis unavailable; limits fail open (closed where asked). Logged once a minute.",
			);
		}
		return options.failClosed
			? { allowed: false, currentCount: limit, limit, retryAfterSeconds: 30 }
			: { allowed: true, currentCount: 0, limit, retryAfterSeconds: 0 };
	}
};
