import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { isSessionRevoked } from "@backend/modules/auth/services/revoked_sessions.auth.service";
import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import { defaultContext } from "@backend/test/setup";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

type Ctx = Awaited<ReturnType<typeof createUserAndLogin>>;

const requireContext = (): Ctx => {
	if (!defaultContext) throw new Error("test context missing");
	return defaultContext;
};

const app = (ctx: Ctx) => createRouterClient(userAppRouter, { context: ctx });

/** A second session for the same account; returns its id. */
const signInAgain = async (ctx: Ctx): Promise<string> => {
	const result = await auth.api.signInEmail({
		body: { email: ctx.user.email ?? "", password: "password123" },
		headers: new Headers({
			"user-agent":
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		}),
	});
	const row = await db.sessions.where({ token: result.token }).select("id").take();
	return row.id;
};

describe("account sessions", () => {
	it("lists ids only, this device first", async () => {
		const ctx = requireContext();
		const otherId = await signInAgain(ctx);
		const list = await app(ctx).account.listSessions();
		expect(list.length).toBeGreaterThanOrEqual(2);
		expect(list[0]).toMatchObject({ id: ctx.session.id, current: true });
		expect(list.map((s) => s.id)).toContain(otherId);
		expect(list.find((s) => s.id === otherId)).toMatchObject({ current: false, os: "iOS" });
		const text = JSON.stringify(list);
		expect(text).not.toMatch(/"token"/);
		expect(text).not.toContain(ctx.session.token);
	});

	it("ends another session at once, never this one or someone else's", async () => {
		const ctx = requireContext();
		const otherId = await signInAgain(ctx);
		await expect(app(ctx).account.revokeSession({ sessionId: otherId })).resolves.toEqual({
			ok: true,
		});
		expect(await db.sessions.unscope("default").where({ id: otherId }).exists()).toBe(false);
		expect(await isSessionRevoked(otherId)).toBe(true);

		await expect(
			app(ctx).account.revokeSession({ sessionId: ctx.session.id }),
		).rejects.toMatchObject({ status: 400 });

		const stranger = await createUserAndLogin();
		await expect(
			app(ctx).account.revokeSession({ sessionId: stranger.session.id }),
		).rejects.toMatchObject({ status: 404 });
		expect(await db.sessions.where({ id: stranger.session.id }).exists()).toBe(true);
	});

	it("ends every other session, keeping this one and the connected apps", async () => {
		const ctx = requireContext();
		await signInAgain(ctx);
		await signInAgain(ctx);
		const before = await db.sessions.where({ userId: ctx.user.id }).count();
		const { ended } = await app(ctx).account.revokeOtherSessions();
		expect(ended).toBe(before - 1);
		expect(await db.sessions.unscope("default").where({ userId: ctx.user.id }).pluck("id")).toEqual(
			[ctx.session.id],
		);
	});
});
