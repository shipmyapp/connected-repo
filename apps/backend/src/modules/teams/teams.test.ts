import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { tbus } from "@backend/events/tbus";
import { auth } from "@backend/modules/auth/auth.config";
import type { NotificationRequest } from "@backend/modules/notifications/services/dispatch.notifications.service";
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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertNotLastOwner } from "./services/team_roles.teams.service";

/** The team-invitation notification queued since the last mockClear, if any. */
const invitationTask = (): NotificationRequest | undefined => {
	for (const [sent] of vi.mocked(tbus.send).mock.calls) {
		for (const task of Array.isArray(sent) ? sent : [sent]) {
			const data: unknown = task.data;
			if (isNotificationRequest(data) && data.workflowId === "team-invitation") return data;
		}
	}
	return undefined;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const isNotificationRequest = (v: unknown): v is NotificationRequest =>
	isRecord(v) &&
	typeof v.workflowId === "string" &&
	isRecord(v.to) &&
	typeof v.to.subscriberId === "string" &&
	isRecord(v.payload);

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

		it("send the same invitation whether or not the address has an account", async (ctx) => {
			if (!(await redisReady(1500))) {
				if (process.env.CI) throw new Error("CI must run a Redis service");
				ctx.skip();
			}
			if (!defaultContext) throw new Error("test context missing");
			const { owner } = await createSharedTeam(defaultContext);
			const existing = await createUserAndLogin({
				email: `known-${ulid().toLowerCase()}@example.com`,
			});
			const unverified = await createUserAndLogin(
				{ email: `unverified-${ulid().toLowerCase()}@example.com` },
				{ verified: false },
			);
			const unknownEmail = `nobody-${ulid().toLowerCase()}@example.com`;

			const invite = async (email: string) => {
				vi.mocked(tbus.send).mockClear();
				const row = await teamsClient(owner).addTeamMember({ email, role: "Member" });
				const task = invitationTask();
				if (!task) throw new Error(`no invitation queued for ${email}`);
				return { row, task };
			};
			const known = await invite(existing.user.email as string);
			const unknown = await invite(unknownEmail);
			const notVerified = await invite(unverified.user.email as string);

			expect(known.task.to.subscriberId).toBe(`email:${existing.user.email}`);
			expect(known.task.to.subscriberId).not.toContain(existing.user.id);
			// Only the greeting differs, and only the invitee reads it.
			expect(known.task.payload.name).toBe(existing.user.name);
			expect(unknown.task.payload).not.toHaveProperty("name");
			expect(notVerified.task.payload).not.toHaveProperty("name");
			const { name: _greeting, email: knownEmail, ...knownRest } = known.task.payload;
			const { email: unknownTaskEmail, ...unknownRest } = unknown.task.payload;
			expect(knownEmail).toBe(existing.user.email);
			expect(unknownTaskEmail).toBe(unknownEmail);
			expect(knownRest).toEqual(unknownRest);
			expect(Object.keys(known.task.payload)).not.toContain("hasAccount");

			// The inviter's answer is the same shape and state either way.
			const comparable = (row: typeof known.row) => {
				const { id: _id, email: _email, createdAt: _c, updatedAt: _u, ...rest } = row;
				return rest;
			};
			expect(comparable(known.row)).toEqual(comparable(unknown.row));
		});

		it("refuse adding yourself", async () => {
			if (!defaultContext) throw new Error("test context missing");
			const { owner } = await createSharedTeam(defaultContext);
			await expect(
				teamsClient(owner).addTeamMember({
					email: (defaultContext.user.email as string).toUpperCase(),
					role: "Member",
				}),
			).rejects.toMatchObject({ status: 409 });
		});

		it("by phone number create a pending row and send no email", async () => {
			if (!defaultContext) throw new Error("test context missing");
			const { owner } = await createSharedTeam(defaultContext);
			vi.mocked(tbus.send).mockClear();
			const row = await teamsClient(owner).addTeamMember({
				phoneNumber: "+14155550123",
				role: "Member",
			});
			expect(row.userId).toBeNull();
			expect(row.joinedAt).toBeNull();
			expect(invitationTask()).toBeUndefined();
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

describe("Team branding / team host", () => {
	let client: RouterClient<typeof teamsAppRouter>;
	const publicClient = createRouterClient(teamsAppRouter, {
		context: { reqHeaders: new Headers({ "x-client-ip": "203.0.113.40" }) },
	});

	const activeTeamId = () => {
		const id = defaultContext?.user.activeTeamAppId;
		if (!id) throw new Error("test context has no active team");
		return id;
	};

	beforeEach(() => {
		client = createRouterClient(teamsAppRouter, { context: defaultContext });
	});

	it("brands the team, and resolves the subdomain the operator assigned publicly", async () => {
		const teamId = activeTeamId();
		// The subdomain is assigned from the super-admin console (its own
		// router and test); the team's own update cannot touch it.
		await db.teamsApp.find(teamId).update({ slug: "acme-events" });
		const input = {
			slug: "somewhere-else",
			appName: "Acme Events",
			appShortName: "Acme",
			tagline: "Every entry, on time.",
			primaryColor: "#ff5722",
			backgroundColor: "#fff",
		};
		const updated = await client.updateTeam(input);
		expect(updated.slug).toBe("acme-events");
		expect(updated.appName).toBe("Acme Events");

		const branding = await publicClient.getBrandingBySlug({ slug: "acme-events" });
		expect(branding).not.toBeNull();
		expect(branding?.teamId).toBe(teamId);
		expect(branding?.primaryColor).toBe("#ff5722");
		// Public projection never carries membership/ownership fields.
		expect(branding).not.toHaveProperty("createdByUserId");
		expect(branding).not.toHaveProperty("personalTeamForUserId");
	});

	it("returns null for an unassigned slug and rejects a malformed colour", async () => {
		expect(await publicClient.getBrandingBySlug({ slug: "nobody-here" })).toBeNull();
		await expect(publicClient.getBrandingBySlug({ slug: "-bad" })).rejects.toThrow();
		await expect(publicClient.getBrandingBySlug({ slug: "www" })).rejects.toThrow();
		await expect(client.updateTeam({ primaryColor: "red" })).rejects.toThrow();
	});

	it("goes dark when the team is soft-deleted", async () => {
		const team = await client.createTeam({ name: "Ephemeral" });
		// Slug written straight to the row: the point of this test is the
		// public lookup honouring the soft-delete, not the update procedure.
		await db.teamsApp.find(team.id).update({ slug: "ephemeral" });
		expect(await publicClient.getBrandingBySlug({ slug: "ephemeral" })).not.toBeNull();

		await db.teamsApp.find(team.id).delete();
		expect(await publicClient.getBrandingBySlug({ slug: "ephemeral" })).toBeNull();
	});

	it("accepts team pictures only from the app's own storage", async () => {
		const teamId = activeTeamId();
		await expect(
			client.updateTeam({ logoUrl: "https://evil.example/x.png" }),
		).rejects.toMatchObject({ status: 400, message: expect.stringContaining("logoUrl") });
		await expect(
			client.updateTeam({ pwaIconUrl: "https://evil.example/icon.png" }),
		).rejects.toMatchObject({ status: 400, message: expect.stringContaining("pwaIconUrl") });
		await expect(client.updateTeam({ pwaIconUrl: "javascript:alert(1)" })).rejects.toMatchObject({
			status: 400,
		});

		const own = `${env.S3_PUBLIC_URL}/${teamId}/branding/x.png`;
		const updated = await client.updateTeam({ logoUrl: own, pwaIconUrl: own });
		expect(updated.logoUrl).toBe(own);
		expect(updated.pwaIconUrl).toBe(own);
	});

	it("lets a Member read but never edit the branding", async () => {
		const { teamId, owner } = await createSharedTeam(
			await createUserAndLogin({ email: `owner-${ulid().toLowerCase()}@example.com` }),
		);
		const member = await addMember(owner, teamId, "Member");
		await expect(teamsClient(member).updateTeam({ appName: "Mine" })).rejects.toMatchObject({
			status: 403,
		});
	});
});
