import { db } from "@backend/db/db";
import { requestContext } from "@backend/lib/request-context";
import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import { defaultContext } from "@backend/test/setup";
import { createSharedTeam } from "@backend/test/utils/team.utils";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { generatePublicUrl } from "@backend/utils/cdn.utils";
import { redisReady } from "@backend/utils/redis.utils";
import { createRouterClient } from "@orpc/server";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";

type Ctx = Awaited<ReturnType<typeof createUserAndLogin>>;

const requireContext = (): Ctx => {
	if (!defaultContext) throw new Error("test context missing");
	return defaultContext;
};

const asMemberOf = <T>(teamId: string, userId: string, fn: () => Promise<T>) =>
	requestContext.run(
		{ tenantTeamId: teamId, userId, teamMemberId: "system", teamMemberRole: "system" },
		fn,
	);

const app = (ctx: Ctx) => createRouterClient(userAppRouter, { context: ctx });

describe("account.exportData", () => {
	it("holds the caller's own rows only, and no secret", async () => {
		const a = requireContext();
		const personalId = a.user.activeTeamAppId as string;
		const mine = await asMemberOf(personalId, a.user.id, async () => {
			const entry = await db.journalEntries.create({
				id: ulid(),
				content: "mine",
				authorUserId: a.user.id,
			});
			await db.files.create({
				id: ulid(),
				tableName: "journalEntries",
				tableId: entry.id,
				type: "attachment",
				fileName: "mine.png",
				mimeType: "image/png",
				createdByUserId: a.user.id,
				cdnUrl: generatePublicUrl("p/mine.png"),
			});
			return entry;
		});

		const { teamId, owner } = await createSharedTeam(a, "Both of us");
		const email = `b-${ulid().toLowerCase()}@example.com`;
		const b = await createUserAndLogin({ email });
		await db.teamMembers.create({ teamId, userId: b.user.id, email, role: "Member", joinedAt: 1 });
		const theirs = await asMemberOf(
			teamId,
			b.user.id,
			async () =>
				await db.journalEntries.create({ id: ulid(), content: "theirs", authorUserId: b.user.id }),
		);
		await db.devices.create({
			id: ulid(),
			userId: a.user.id,
			deviceKey: "d".repeat(22),
			platform: "desktop",
			fcmToken: "secret-push-address",
			firstSeenAt: Date.now(),
			lastSeenAt: Date.now(),
		});

		const result = await app(owner).account.exportData();

		expect(result.format).toBe("account-export/1");
		expect(result.account.id).toBe(a.user.id);
		expect(result.journalEntries.map((e) => e.id)).toEqual([mine.id]);
		expect(result.journalEntries.map((e) => e.id)).not.toContain(theirs.id);
		expect(result.files.map((f) => f.fileName)).toEqual(["mine.png"]);
		expect(result.memberships.map((m) => m.teamName).sort()).toEqual(
			expect.arrayContaining(["Both of us"]),
		);
		expect(result.devices).toHaveLength(1);
		expect(result.sessions.length).toBeGreaterThan(0);
		expect(result.truncated).toEqual([]);

		const text = JSON.stringify(result);
		expect(text).not.toMatch(
			/"token"|accessToken|refreshToken|idToken|fcmToken|password|apiSecret|deviceKey/,
		);
		expect(text).not.toContain("secret-push-address");
		expect(text).not.toContain(a.session.token);
		expect(text).not.toContain(b.user.id);
	});

	it("is limited to three an hour", async (ctx) => {
		if (!(await redisReady(1500))) {
			if (process.env.CI) throw new Error("CI must run a Redis service");
			ctx.skip();
		}
		const client = app(requireContext());
		for (let i = 0; i < 3; i++) await client.account.exportData();
		await expect(client.account.exportData()).rejects.toMatchObject({ status: 429 });
	});
});
