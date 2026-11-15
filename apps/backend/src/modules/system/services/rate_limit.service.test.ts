import { getRedis } from "@backend/configs/redis.config";
import { checkAndRecordRateLimit } from "@backend/modules/system/services/rate_limit.service";
import { redisReady } from "@backend/utils/redis.utils";
import { ulid } from "ulid";
import { afterEach, describe, expect, it, type TestContext, vi } from "vitest";

/**
 * Tests that need a live Redis skip when none is reachable, except in CI,
 * where a missing Redis service is a broken pipeline and must fail.
 */
const needsRedis = async (ctx: TestContext) => {
	if (await redisReady(1500)) return;
	if (process.env.CI) {
		throw new Error("CI must run a Redis service at REDIS_URL (.github/workflows/ci.yml)");
	}
	ctx.skip();
};

describe("checkAndRecordRateLimit (Redis token bucket)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("allows `limit` hits in a burst, then refuses with a retry time", async (ctx) => {
		await needsRedis(ctx);
		const key = `test:burst:${ulid()}`;
		for (let i = 0; i < 3; i++) {
			const ok = await checkAndRecordRateLimit(key, 3, 60);
			expect(ok.allowed).toBe(true);
			expect(ok.currentCount).toBe(i + 1);
		}
		const refused = await checkAndRecordRateLimit(key, 3, 60);
		expect(refused).toMatchObject({ allowed: false, currentCount: 3, limit: 3 });
		expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
	});

	it("refills continuously at limit / window", async (ctx) => {
		await needsRedis(ctx);
		const key = `test:refill:${ulid()}`;
		expect((await checkAndRecordRateLimit(key, 2, 1)).allowed).toBe(true);
		expect((await checkAndRecordRateLimit(key, 2, 1)).allowed).toBe(true);
		expect((await checkAndRecordRateLimit(key, 2, 1)).allowed).toBe(false);
		// 2 tokens per second: 600 ms brings back more than one token.
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect((await checkAndRecordRateLimit(key, 2, 1)).allowed).toBe(true);
	});

	it("stores the bucket under rl:<key> and lets it expire within the window", async (ctx) => {
		await needsRedis(ctx);
		const key = `test:ttl:${ulid()}`;
		await checkAndRecordRateLimit(key, 5, 60);
		const ttl = await getRedis().pttl(`rl:${key}`);
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(60_000);
	});

	it("lets the request through when Redis fails (fail open)", async () => {
		vi.spyOn(getRedis(), "eval").mockRejectedValueOnce(new Error("down"));
		const result = await checkAndRecordRateLimit(`test:open:${ulid()}`, 1, 60);
		expect(result).toEqual({
			allowed: true,
			currentCount: 0,
			limit: 1,
			retryAfterSeconds: 0,
		});
	});

	it("refuses when Redis fails and the caller asked to fail closed", async () => {
		vi.spyOn(getRedis(), "eval").mockRejectedValueOnce(new Error("down"));
		const result = await checkAndRecordRateLimit(`test:closed:${ulid()}`, 1, 60, {
			failClosed: true,
		});
		expect(result).toEqual({
			allowed: false,
			currentCount: 1,
			limit: 1,
			retryAfterSeconds: 30,
		});
	});
});
