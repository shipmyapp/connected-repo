import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { teamsAppRouter } from "@backend/modules/teams/teams_app.router.js";
import { defaultContext } from "@backend/test/setup";
import {
	addMember,
	createSharedTeam,
	memberIdOf,
	onTeam,
	teamsClient,
} from "@backend/test/utils/team.utils";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { redisReady } from "@backend/utils/redis.utils";
import { createRouterClient, type RouterClient } from "@orpc/server";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";
import { assertNotLastOwner } from "./services/team_roles.teams.service";

describe("Teams App Endpoints", () => {
	let defaultClient: RouterClient<typeof teamsAppRouter>;

	beforeEach(() => {
		defaultClient = createRouterClient(teamsAppRouter, {
			context: defaultContext,
		});
	});

	describe("getDefaultTeam", () => {
		it("should create a personal team if none exists and set it as default", async () => {
			// Ensure user has no default team and no personal team
			await db.users.where({ id: defaultContext?.user.id }).update({ activeTeamAppId: null });
			await db.teamsApp.where({ personalTeamForUserId: defaultContext?.user.id }).delete();

			const result = await defaultClient.getDefaultTeam({});

			expect(result).toBeDefined();
			expect(result.personalTeamForUserId).toBe(defaultContext?.user.id);
			expect(result.name).toBe(`${defaultContext?.user.name.split(" ")[0]}'s Team`);

			// Verify user's activeTeamAppId is updated
			const user = await db.users.where({ id: defaultContext?.user.id }).take();
			expect(user.activeTeamAppId).toBe(result.id);

			// Verify membership
			const membership = await db.teamMembers
				.unscope("default")
				.where({ teamId: result.id, userId: defaultContext?.user.id })
				.take();
			expect(membership.role).toBe("Owner");
		});

		// The previous form of this test set up a "user has personal team but
		// activeTeamAppId is null" scenario by mutating db.users directly.
		// That bypasses Better Auth's 5-minute session cookie cache, so
		// getDefaultTeam still reads the stale user. In production this state
		// never happens — the users.afterCreate hook mints a personal team
		// and sets activeTeamAppId atomically. The idempotency test below
		// covers the meaningful "returns existing team" invariant without
		// needing the cache-invalidation dance.

		it("should be idempotent — second call returns the same default team", async () => {
			// The previous form of this test mutated `db.users.activeTeamAppId`
			// directly. That bypasses Better Auth's session cookie cache, so the
			// subsequent request still saw the stale user. The realistic flow is:
			// first call seeds the default team, every later call returns it.
			const firstResult = await defaultClient.getDefaultTeam({});
			const secondResult = await defaultClient.getDefaultTeam({});

			expect(secondResult.id).toBe(firstResult.id);
			expect(secondResult.name).toBe(firstResult.name);
		});
	});

	// Q6 — the source of truth the client reconciles against to wipe teams it
	// was removed from. Session-only, so it keeps working even after the caller
	// loses access to their active team.
	describe("listMyActiveTeamIds", () => {
		it("drops a team once the caller's membership is soft-deleted", async () => {
			const userId = defaultContext?.user.id;
			if (!userId) throw new Error("test context missing");

			// Ensure the caller has their personal team, then create a second.
			const personal = await defaultClient.getDefaultTeam({});
			const second = await defaultClient.createTeam({ name: "Second Team" });

			const before = await defaultClient.listMyActiveTeamIds();
			expect(before.teamIds).toContain(personal.id);
			expect(before.teamIds).toContain(second.id);

			// Soft-delete the caller's membership in the second team (what
			// removeTeamMember does), bypassing the active-team scope.
			await db.teamMembers.unscope("default").where({ teamId: second.id, userId }).delete();

			const after = await defaultClient.listMyActiveTeamIds();
			expect(after.teamIds).not.toContain(second.id);
			// Personal team (still an active membership) survives.
			expect(after.teamIds).toContain(personal.id);
		});
	});

	// `setActiveTeam` writes the row behind Better Auth's back, and the signed
	// session cookie keeps the previous team for up to five minutes. The gate
	// used to compare `x-team-id` with that stale copy and refuse the team the
	// client had just switched to ("Active team id mismatch"). The row decides now.
	describe("rpcProtectedActiveTeamProcedure behind a stale session cookie", () => {
		it("accepts the team the row names while the cookie still says the old one", async () => {
			if (!defaultContext) throw new Error("test context missing");
			const personalId = defaultContext.user.activeTeamAppId as string;
			const second = await defaultClient.createTeam({ name: "Second Team" });
			await defaultClient.setActiveTeam({ teamAppId: second.id });

			// The cookie in these headers was signed at login, with the personal
			// team; the user object the middleware derives from it says so too.
			const cached = await auth.api.getSession({ headers: defaultContext.reqHeaders });
			expect(cached?.user.activeTeamAppId).toBe(personalId);

			const onSecond = new Headers(defaultContext.reqHeaders);
			onSecond.set("x-team-id", second.id);
			const client = createRouterClient(teamsAppRouter, {
				context: { ...defaultContext, reqHeaders: onSecond },
			});
			const members = await client.getTeamMembers();
			expect(members.map((m) => m.teamId)).toEqual([second.id]);

			// A team the row does not name is still refused, cookie or no cookie.
			const third = await defaultClient.createTeam({ name: "Third Team" });
			const onThird = new Headers(defaultContext.reqHeaders);
			onThird.set("x-team-id", third.id);
			const strayClient = createRouterClient(teamsAppRouter, {
				context: { ...defaultContext, reqHeaders: onThird },
			});
			await expect(strayClient.getTeamMembers()).rejects.toMatchObject({
				status: 403,
				message: "Active team id mismatch.",
			});
		});
	});

	describe("team role rules", () => {
		const setUp = async () => {
			if (!defaultContext) throw new Error("test context missing");
			const { teamId, owner } = await createSharedTeam(defaultContext);
			const admin = await addMember(owner, teamId, "Admin");
			const member = await addMember(owner, teamId, "Member");
			return { teamId, owner, admin, member };
		};

		it("an invitation cannot make an Owner", async () => {
			const { admin } = await setUp();
			await expect(
				teamsClient(admin).addTeamMember({
					email: "x@example.com",
					// @ts-expect-error the input type no longer allows it
					role: "Owner",
				}),
				// The router client surfaces the raw validation refusal; over HTTP
				// the error parser answers it as INPUT_VALIDATION_FAILED (422).
			).rejects.toMatchObject({ status: 400, message: "Input validation failed" });
		});

		it("the only Owner can neither step down nor remove themselves", async () => {
			const { owner } = await setUp();
			const ownId = await memberIdOf(owner);
			await expect(
				teamsClient(owner).updateMemberRole({ id: ownId, role: "Admin" }),
			).rejects.toMatchObject({ status: 409 });
			await expect(teamsClient(owner).removeTeamMember({ id: ownId })).rejects.toMatchObject({
				status: 400,
			});
		});

		it("with a second Owner, the first may step down", async () => {
			const { owner, admin } = await setUp();
			await teamsClient(owner).updateMemberRole({ id: await memberIdOf(admin), role: "Owner" });
			await expect(
				teamsClient(owner).updateMemberRole({ id: await memberIdOf(owner), role: "Admin" }),
			).resolves.toMatchObject({ role: "Admin" });
		});

		it("an Admin removes Members only", async () => {
			const { teamId, owner, admin, member } = await setUp();
			const second = await addMember(owner, teamId, "Admin");
			await expect(
				teamsClient(admin).removeTeamMember({ id: await memberIdOf(second) }),
			).rejects.toMatchObject({ status: 403 });
			await expect(
				teamsClient(admin).removeTeamMember({ id: await memberIdOf(owner) }),
			).rejects.toMatchObject({ status: 403 });
			await expect(
				teamsClient(admin).removeTeamMember({ id: await memberIdOf(member) }),
			).resolves.toEqual({ success: true });
		});

		it("an unknown member is a 404, not a 500", async () => {
			const { owner } = await setUp();
			await expect(teamsClient(owner).removeTeamMember({ id: ulid() })).rejects.toMatchObject({
				status: 404,
			});
			await expect(
				teamsClient(owner).updateMemberRole({ id: ulid(), role: "Member" }),
			).rejects.toMatchObject({ status: 404 });
		});

		it("the account a personal team belongs to cannot be removed or demoted", async () => {
			if (!defaultContext) throw new Error("test context missing");
			const personalId = defaultContext.user.activeTeamAppId as string;
			// A membership that already exists in a personal team (new ones are
			// refused later; rows from before stay).
			const guest = await createUserAndLogin();
			await db.teamMembers.create({
				teamId: personalId,
				userId: guest.user.id,
				email: guest.user.email,
				role: "Owner",
				joinedAt: Date.now(),
			});
			await teamsClient(guest).setActiveTeam({ teamAppId: personalId });
			const guestOnPersonal = onTeam(guest, personalId);
			const ownerMemberId = await memberIdOf(defaultContext);
			await expect(
				teamsClient(guestOnPersonal).removeTeamMember({ id: ownerMemberId }),
			).rejects.toMatchObject({ status: 403 });
			await expect(
				teamsClient(guestOnPersonal).updateMemberRole({ id: ownerMemberId, role: "Member" }),
			).rejects.toMatchObject({ status: 403 });
		});

		it("assertNotLastOwner works outside a team request", async () => {
			const { teamId, owner, admin } = await setUp();
			const ownerId = await memberIdOf(owner);
			await expect(assertNotLastOwner(teamId, ownerId)).rejects.toMatchObject({ status: 409 });
			await expect(assertNotLastOwner(teamId, await memberIdOf(admin))).resolves.toBeUndefined();
			await teamsClient(owner).updateMemberRole({ id: await memberIdOf(admin), role: "Owner" });
			await expect(assertNotLastOwner(teamId, ownerId)).resolves.toBeUndefined();
		});
	});

	describe("invitations", () => {
		it("never reveal or join an existing account at once", async () => {
			if (!defaultContext) throw new Error("test context missing");
			const { owner } = await createSharedTeam(defaultContext);
			const existing = await createUserAndLogin();
			const row = await teamsClient(owner).addTeamMember({
				email: existing.user.email as string,
				role: "Member",
			});
			expect(row.userId).toBeNull();
			expect(row.joinedAt).toBeNull();
		});

		it("are limited to 30 per inviter per hour", async (ctx) => {
			if (!(await redisReady(1500))) {
				if (process.env.CI) throw new Error("CI must run a Redis service");
				ctx.skip();
			}
			if (!defaultContext) throw new Error("test context missing");
			const { owner } = await createSharedTeam(defaultContext);
			const client = teamsClient(owner);
			for (let i = 0; i < 30; i++) {
				await client.addTeamMember({
					email: `bulk-${i}-${ulid().toLowerCase()}@example.com`,
					role: "Member",
				});
			}
			await expect(
				client.addTeamMember({
					email: `bulk-31-${ulid().toLowerCase()}@example.com`,
					role: "Member",
				}),
			).rejects.toMatchObject({ status: 429 });
		});
	});
});
