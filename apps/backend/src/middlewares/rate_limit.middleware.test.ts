import { getRedis } from "@backend/configs/redis.config";
import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import { redisReady } from "@backend/utils/redis.utils";
import { createRouterClient, os } from "@orpc/server";
import { ulid } from "ulid";
import { afterEach, describe, expect, it, type TestContext, vi } from "vitest";

type Ctx = { id: string; limited: boolean };

const needsRedis = async (ctx: TestContext) => {
	if (await redisReady(1500)) return;
	if (process.env.CI) {
		throw new Error("CI must run a Redis service at REDIS_URL (.github/workflows/ci.yml)");
	}
	ctx.skip();
};

const router = {
	sync: os
		.$context<Ctx>()
		.use(
			createRateLimitMiddleware<Ctx>({
				bucketFn: (ctx) =>
					ctx.limited ? { key: `test:mw:${ctx.id}`, limit: 1, windowSeconds: 60 } : null,
				label: "test",
			}),
		)
		.handler(() => "ok"),
	async: os
		.$context<Ctx>()
		.use(
			createRateLimitMiddleware<Ctx>({
				bucketFn: async (ctx) => ({ key: `test:mw-async:${ctx.id}`, limit: 1, windowSeconds: 60 }),
			}),
		)
		.handler(() => "ok"),
	closed: os
		.$context<Ctx>()
		.use(
			createRateLimitMiddleware<Ctx>({
				bucketFn: (ctx) => ({ key: `test:mw-closed:${ctx.id}`, limit: 5, windowSeconds: 60 }),
				failClosed: true,
			}),
		)
		.handler(() => "ok"),
};

const clientFor = (limited: boolean) =>
	createRouterClient(router, { context: { id: ulid(), limited } });

describe("createRateLimitMiddleware", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("answers 429 TOO_MANY_REQUESTS once the bucket is empty", async (ctx) => {
		await needsRedis(ctx);
		const client = clientFor(true);
		await expect(client.sync()).resolves.toBe("ok");
		await expect(client.sync()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			status: 429,
			data: { retryAfterSeconds: expect.any(Number) },
		});
	});

	it("does not limit when bucketFn returns null", async () => {
		const client = clientFor(false);
		for (let i = 0; i < 5; i++) await expect(client.sync()).resolves.toBe("ok");
	});

	it("accepts an async bucketFn", async (ctx) => {
		await needsRedis(ctx);
		const client = clientFor(true);
		await expect(client.async()).resolves.toBe("ok");
		await expect(client.async()).rejects.toMatchObject({ status: 429 });
	});

	it("refuses when Redis fails and the middleware fails closed", async () => {
		vi.spyOn(getRedis(), "eval").mockRejectedValueOnce(new Error("down"));
		await expect(clientFor(true).closed()).rejects.toMatchObject({ status: 429 });
	});
});
