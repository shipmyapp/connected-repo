import { journalEntriesOpenApiRouter } from "@backend/modules/journal-entries/journal-entries.openapi.router";
import { promptsRouter } from "@backend/modules/prompts/prompts.router";
import { teamsAppRouter } from "@backend/modules/teams/teams_app.router";
import { defaultContext } from "@backend/test/setup";
import { redisReady } from "@backend/utils/redis.utils";
import { createRouterClient } from "@orpc/server";
import { ulid } from "ulid";
import { describe, expect, it, type TestContext } from "vitest";

const needsRedis = async (ctx: TestContext) => {
	if (await redisReady(1500)) return;
	if (process.env.CI) throw new Error("CI must run a Redis service at REDIS_URL");
	ctx.skip();
};

// A fresh documentation-range address per test keeps buckets apart, also
// between runs less than a minute apart.
const hex = () => Math.floor(Math.random() * 0xffff).toString(16);
const ipHeaders = () => new Headers({ "x-client-ip": `2001:db8::${hex()}:${hex()}:${hex()}` });

describe("limits before work", () => {
	it("prompts.getById: 60 per minute per address", async (ctx) => {
		await needsRedis(ctx);
		const client = createRouterClient(promptsRouter, { context: { reqHeaders: ipHeaders() } });
		for (let i = 0; i < 60; i++) {
			// Unknown id: the lookup runs and fails (not found), not the limit.
			const error = await client.getById({ id: ulid() }).catch((err: unknown) => err);
			expect(error).not.toMatchObject({ status: 429 });
		}
		await expect(client.getById({ id: ulid() })).rejects.toMatchObject({ status: 429 });
	});

	it("OpenAPI: 120 anonymous calls per minute per address, before the key check", async (ctx) => {
		await needsRedis(ctx);
		const reqHeaders = ipHeaders();
		reqHeaders.set("x-team-id", ulid());
		reqHeaders.set("x-api-key", "not-a-key");
		const client = createRouterClient(journalEntriesOpenApiRouter, { context: { reqHeaders } });
		const input = {
			teamUserReferenceId: "r",
			apiProductSku: "journal_entry_create" as const,
			data: { id: ulid(), content: "x" },
		};
		// The bucket refills 2 per second while the refused key checks run, so
		// count the refusals up to the first 429 instead of expecting it at 121.
		let refusedByKeyCheck = 0;
		let limited = false;
		for (let i = 0; i < 200 && !limited; i++) {
			const error = await client["create-request"](input).catch((err: unknown) => err);
			if (error instanceof Object && "status" in error && error.status === 429) limited = true;
			else {
				expect(error).toMatchObject({ status: 401 });
				refusedByKeyCheck++;
			}
		}
		expect(limited).toBe(true);
		expect(refusedByKeyCheck).toBeGreaterThanOrEqual(120);
	}, 60_000);

	it("createTeam: 10 per user per hour", async (ctx) => {
		await needsRedis(ctx);
		if (!defaultContext) throw new Error("test context missing");
		const client = createRouterClient(teamsAppRouter, { context: defaultContext });
		for (let i = 0; i < 10; i++) await client.createTeam({ name: `T${i}` });
		await expect(client.createTeam({ name: "T10" })).rejects.toMatchObject({ status: 429 });
	});
});
