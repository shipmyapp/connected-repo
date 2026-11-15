import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { teamsClient } from "@backend/test/utils/team.utils";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { ulid } from "ulid";
import { describe, expect, it, vi } from "vitest";

describe("sign-in doors", () => {
	it("offers email + password only under NODE_ENV=test", async () => {
		expect(auth.options.emailAndPassword?.enabled).toBe(true);
		vi.resetModules();
		vi.doMock("@backend/configs/env.config", async (importOriginal) => ({
			...(await importOriginal<typeof import("@backend/configs/env.config")>()),
			isTest: false,
			isProd: true,
		}));
		const prod = await import("./auth.config.js");
		expect(prod.auth.options.emailAndPassword?.enabled).toBe(false);
		vi.doUnmock("@backend/configs/env.config");
		vi.resetModules();
	});

	it("serves no phone-code routes", () => {
		for (const name of ["sendPhoneNumberOTP", "signInPhoneNumber", "verifyPhoneNumber"]) {
			expect(name in auth.api).toBe(false);
		}
	});

	it("keeps the phone fields on the session user", async () => {
		const context = await createUserAndLogin();
		expect(context.user.phoneNumber).toBeNull();
		expect(context.user.phoneNumberVerified).toBe(false);
	});
});

describe("invitations need a proved address", () => {
	const invite = async (teamId: string, email: string) =>
		db.teamMembers.create({ teamId, email, role: "Member", userId: null, joinedAt: null });

	it("an unverified sign-up claims nothing, at sign-up or on getMyTeams", async () => {
		const owner = await createUserAndLogin();
		const teamId = owner.user.activeTeamAppId as string;
		const email = `invited-${ulid().toLowerCase()}@example.com`;
		const row = await invite(teamId, email);

		const stranger = await createUserAndLogin({ email }, { verified: false });
		await teamsClient(stranger).getMyTeams();

		const after = await db.teamMembers.unscope("default").find(row.id);
		expect(after.userId).toBeNull();
	});

	it("a verified account claims it on getMyTeams", async () => {
		const owner = await createUserAndLogin();
		const teamId = owner.user.activeTeamAppId as string;
		const email = `invited-${ulid().toLowerCase()}@example.com`;
		const row = await invite(teamId, email);

		const invitee = await createUserAndLogin({ email });
		const teams = await teamsClient(invitee).getMyTeams();

		expect(teams.map((t) => t.id)).toContain(teamId);
		const after = await db.teamMembers.unscope("default").find(row.id);
		expect(after.userId).toBe(invitee.user.id);
	});
});

describe("account linking", () => {
	it("a Google link to an unverified user evicts its password and sessions", async () => {
		const email = `squat-${ulid().toLowerCase()}@example.com`;
		const squatter = await createUserAndLogin({ email }, { verified: false });
		const userId = squatter.user.id;

		const ctx = await auth.$context;
		await ctx.internalAdapter.linkAccount({
			providerId: "google",
			accountId: `google-${ulid()}`,
			userId,
		});

		const accounts = await db.accounts.where({ userId }).pluck("providerId");
		expect(accounts).toEqual(["google"]);
		expect(await db.sessions.unscope("default").where({ userId }).count()).toBe(0);
		await expect(
			auth.api.signInEmail({ body: { email, password: "password123" } }),
		).rejects.toThrow();
	});

	it("leaves a verified user's password alone", async () => {
		const verified = await createUserAndLogin();
		const ctx = await auth.$context;
		await ctx.internalAdapter.linkAccount({
			providerId: "google",
			accountId: `google-${ulid()}`,
			userId: verified.user.id,
		});
		const providers = await db.accounts.where({ userId: verified.user.id }).pluck("providerId");
		expect(providers.sort()).toEqual(["credential", "google"]);
	});
});
