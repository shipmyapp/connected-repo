import { db } from "@backend/db/db";
import { teamsClient } from "@backend/test/utils/team.utils";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { beforeEach, describe, expect, it } from "vitest";

// A team host (`<slug>.<root>`, TENANT_ROOT_DOMAIN=localhost in .env.test)
// is locked to its team and never writes users.activeTeamAppId. The gate
// accepts x-team-id = the team whose host sent the request; membership is
// still the authorisation.
type Login = Awaited<ReturnType<typeof createUserAndLogin>>;

const withHeaders = (login: Login, headers: Record<string, string>): Login => {
	const reqHeaders = new Headers(login.reqHeaders);
	for (const [name, value] of Object.entries(headers)) reqHeaders.set(name, value);
	return { ...login, reqHeaders };
};

describe("the active-team gate on a team host", () => {
	let login: Login;
	let personalTeamId: string;
	let acmeId: string;
	let otherId: string;

	beforeEach(async () => {
		login = await createUserAndLogin();
		if (!login.user.activeTeamAppId) throw new Error("no personal team");
		personalTeamId = login.user.activeTeamAppId;
		const acme = await teamsClient(login).createTeam({ name: "Acme" });
		acmeId = acme.id;
		await db.teamsApp.find(acmeId).update({ slug: "acme" });
		// A team this user does not belong to, with its own host.
		const stranger = await createUserAndLogin();
		const other = await db.teamsApp.create({
			name: "Other",
			createdByUserId: stranger.user.id,
			slug: "other",
		});
		otherId = other.id;
	});

	it("accepts the host's team without moving the user's active team", async () => {
		const onAcmeHost = withHeaders(login, {
			"x-team-id": acmeId,
			origin: "http://acme.localhost:5174",
		});
		const members = await teamsClient(onAcmeHost).getTeamMembers();
		expect(members.map((m) => m.teamId)).toEqual([acmeId]);

		const row = await db.users.find(login.user.id).select("activeTeamAppId");
		expect(row.activeTeamAppId).toBe(personalTeamId);
	});

	it("falls back to Host / X-Forwarded-Host when there is no Origin", async () => {
		const viaHost = withHeaders(login, {
			"x-team-id": acmeId,
			"x-forwarded-host": "acme.localhost",
		});
		await expect(teamsClient(viaHost).getTeamMembers()).resolves.toHaveLength(1);
	});

	it("still serves the row's team from a team host", async () => {
		const personalOnAcmeHost = withHeaders(login, {
			"x-team-id": personalTeamId,
			origin: "http://acme.localhost:5174",
		});
		await expect(teamsClient(personalOnAcmeHost).getTeamMembers()).resolves.toHaveLength(1);
	});

	it("refuses the team without its host", async () => {
		const noHost = withHeaders(login, { "x-team-id": acmeId });
		await expect(teamsClient(noHost).getTeamMembers()).rejects.toMatchObject({
			status: 403,
			message: "Active team id mismatch.",
		});
	});

	it("refuses another team's host header naming a different team", async () => {
		const mixed = withHeaders(login, {
			"x-team-id": acmeId,
			origin: "http://other.localhost:5174",
		});
		await expect(teamsClient(mixed).getTeamMembers()).rejects.toMatchObject({
			status: 403,
			message: "Active team id mismatch.",
		});
	});

	it("refuses a non-member on the team's own host", async () => {
		const onOtherHost = withHeaders(login, {
			"x-team-id": otherId,
			origin: "http://other.localhost:5174",
		});
		await expect(teamsClient(onOtherHost).getTeamMembers()).rejects.toMatchObject({
			status: 403,
			message: "Not a member of this team.",
		});
	});

	it("never reads a team from a host that is not a single, unreserved label under the root", async () => {
		// A reserved label written straight to the row (the schemas refuse it):
		// its host is still not a team host.
		await db.teamsApp.find(acmeId).update({ slug: "www" });
		for (const origin of [
			"http://www.localhost:5174",
			"http://a.www.localhost:5174",
			"http://www.localhost.evil.test",
			"http://evilwww.localhost.test",
		]) {
			const forged = withHeaders(login, { "x-team-id": acmeId, origin });
			await expect(teamsClient(forged).getTeamMembers()).rejects.toMatchObject({
				status: 403,
				message: "Active team id mismatch.",
			});
		}
	});

	it("goes dark for a soft-deleted team", async () => {
		await db.teamsApp.find(acmeId).delete();
		const onAcmeHost = withHeaders(login, {
			"x-team-id": acmeId,
			origin: "http://acme.localhost:5174",
		});
		await expect(teamsClient(onAcmeHost).getTeamMembers()).rejects.toMatchObject({
			status: 403,
			message: "Active team id mismatch.",
		});
	});
});
