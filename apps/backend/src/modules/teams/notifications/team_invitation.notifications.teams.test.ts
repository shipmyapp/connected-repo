import { getRedis } from "@backend/configs/redis.config";
import { db } from "@backend/db/db";
import { tbus } from "@backend/events/tbus";
import { queueTeamInvitation } from "@backend/modules/teams/notifications/team_invitation.notifications.teams";
import { createTeamService } from "@backend/modules/teams/services/create_team.teams.service";
import { defaultContext } from "@backend/test/setup";
import { redisReady } from "@backend/utils/redis.utils";
import { DEFAULT_APP_BRAND } from "@connected-repo/zod-schemas/tenant.utils";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Each case its own address, so the per-address bucket starts full. */
const freshAddress = (label: string) => `${label}-${ulid().toLowerCase()}@example.com`;

const sentTasks = () => JSON.stringify(vi.mocked(tbus.send).mock.calls);

const newTeam = async (name = "Invite test") => {
	const user = defaultContext?.user;
	if (!user) throw new Error("test context missing");
	return await createTeamService(user.id, user.email, null, { name });
};

describe("queueTeamInvitation", () => {
	beforeEach(() => {
		vi.mocked(tbus.send).mockClear();
	});

	it("queues the team-invitation email to the address's own subscriber", async (ctx) => {
		if (!(await redisReady(1500))) {
			if (process.env.CI) throw new Error("CI must run a Redis service");
			ctx.skip();
		}
		const team = await newTeam();
		const address = freshAddress("New.Person");
		await queueTeamInvitation({
			teamId: team.id,
			email: address.toUpperCase(),
			role: "Member",
			inviterName: "Ada",
		});
		expect(tbus.send).toHaveBeenCalledTimes(1);
		const sent = sentTasks();
		expect(sent).toContain('"team-invitation"');
		expect(sent).toContain(`"email:${address.toLowerCase()}"`);
		expect(sent).toContain("Invite test");
		// A team without its own host opens the shared app, under the template's name.
		expect(sent).toContain('"url":"http://localhost:5174/dashboard"');
		expect(sent).toContain(`"appName":"${DEFAULT_APP_BRAND.appName}"`);
		expect(sent).not.toContain("hasAccount");
	});

	it("links a team with its own host there, under the team's app name", async (ctx) => {
		if (!(await redisReady(1500))) {
			if (process.env.CI) throw new Error("CI must run a Redis service");
			ctx.skip();
		}
		const team = await newTeam("Acme");
		await db.teamsApp.find(team.id).update({ slug: "acme-invites" });
		await queueTeamInvitation({
			teamId: team.id,
			email: freshAddress("host"),
			role: "Member",
			inviterName: "Ada",
		});
		const sent = sentTasks();
		expect(sent).toContain('"url":"http://acme-invites.localhost:5174/dashboard"');
		expect(sent).toContain('"appName":"Acme"');

		vi.mocked(tbus.send).mockClear();
		await db.teamsApp.find(team.id).update({ appName: "Acme Journal" });
		await queueTeamInvitation({
			teamId: team.id,
			email: freshAddress("host"),
			role: "Member",
			inviterName: "Ada",
		});
		expect(sentTasks()).toContain('"appName":"Acme Journal"');
	});

	it("resolves when the queue cannot be written", async () => {
		const team = await newTeam();
		vi.mocked(tbus.send).mockRejectedValueOnce(new Error("queue down"));
		await expect(
			queueTeamInvitation({
				teamId: team.id,
				email: freshAddress("queue-down"),
				role: "Member",
				inviterName: "Ada",
			}),
		).resolves.toBeUndefined();
	});

	it("sends one address at most five a day, across teams", async (ctx) => {
		if (!(await redisReady(1500))) {
			if (process.env.CI) throw new Error("CI must run a Redis service");
			ctx.skip();
		}
		const address = freshAddress("often");
		for (let i = 0; i < 6; i++) {
			const team = await newTeam(`Team ${i}`);
			await expect(
				queueTeamInvitation({
					teamId: team.id,
					email: address,
					role: "Member",
					inviterName: "Ada",
				}),
			).resolves.toBeUndefined();
		}
		expect(tbus.send).toHaveBeenCalledTimes(5);
	});

	it("sends nothing while Redis is down (the address limit fails closed)", async () => {
		const team = await newTeam();
		vi.spyOn(getRedis(), "eval").mockRejectedValueOnce(new Error("redis down"));
		await expect(
			queueTeamInvitation({
				teamId: team.id,
				email: freshAddress("redis-down"),
				role: "Member",
				inviterName: "Ada",
			}),
		).resolves.toBeUndefined();
		expect(tbus.send).not.toHaveBeenCalled();
	});
});
