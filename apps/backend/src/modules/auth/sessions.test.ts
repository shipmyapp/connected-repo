import { auth } from "@backend/modules/auth/auth.config";
import { teamsAppRouter } from "@backend/modules/teams/teams_app.router";
import { rpcSensitiveProcedure } from "@backend/procedures/sensitive.procedure";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { redisReady } from "@backend/utils/redis.utils";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it, type TestContext } from "vitest";

const needsRedis = async (ctx: TestContext) => {
	if (await redisReady(1500)) return;
	if (process.env.CI) throw new Error("CI must run a Redis service at REDIS_URL");
	ctx.skip();
};

describe("sessions", () => {
	it("an ended session is refused at once, cookie cache or not", async (ctx) => {
		await needsRedis(ctx);
		const context = await createUserAndLogin();
		const client = createRouterClient(teamsAppRouter, { context });
		await expect(client.listMyActiveTeamIds()).resolves.toBeDefined();

		const authCtx = await auth.$context;
		await authCtx.internalAdapter.deleteSessions(context.user.id);

		await expect(client.listMyActiveTeamIds()).rejects.toMatchObject({ status: 401 });
	});

	it("a sensitive call from another network is logged, not refused", async () => {
		const router = { act: rpcSensitiveProcedure.handler(() => "ok") };
		const { user } = await createUserAndLogin();
		// A session opened from one network…
		const signIn = await auth.api.signInEmail({
			body: { email: user.email as string, password: "password123" },
			headers: new Headers({ "x-client-ip": "198.51.100.4" }),
			asResponse: true,
		});
		const reqHeaders = new Headers({ cookie: signIn.headers.getSetCookie().join("; ") });
		const opened = await auth.api.getSession({ headers: reqHeaders });
		expect(opened?.session.ipAddress).toBe("198.51.100.4");
		// …used from another one.
		reqHeaders.set("x-client-ip", "203.0.113.9");
		await expect(createRouterClient(router, { context: { reqHeaders } }).act()).resolves.toBe("ok");
	});
});
