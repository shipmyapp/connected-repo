import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { isSessionRevoked } from "@backend/modules/auth/services/revoked_sessions.auth.service";
import { superAdminRouter } from "@backend/routers/super_admin/super_admin.router";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { createRouterClient, type RouterClient } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The allowlist is read from env when the procedure module loads, so the
// admin identity has to be fixed before the router is imported.
const { SUPER_ADMIN_EMAIL } = vi.hoisted(() => ({
	SUPER_ADMIN_EMAIL: "admin@example.test",
}));

vi.mock("@backend/configs/env.config", async (importOriginal) => {
	const original = await importOriginal<typeof import("@backend/configs/env.config")>();
	return {
		...original,
		env: { ...original.env, SUPER_ADMIN_EMAILS: SUPER_ADMIN_EMAIL },
	};
});

describe("Super-admin router", () => {
	let superAdmin: RouterClient<typeof superAdminRouter>;
	let adminUserId: string;
	let personalTeamId: string;

	beforeEach(async () => {
		const context = await createUserAndLogin({ email: SUPER_ADMIN_EMAIL, name: "Admin Person" });
		adminUserId = context.user.id;
		if (!context.user.activeTeamAppId) throw new Error("admin has no personal team");
		personalTeamId = context.user.activeTeamAppId;
		superAdmin = createRouterClient(superAdminRouter, { context });
	});

	it("names the operator", async () => {
		const res = await superAdmin.ping();
		expect(res.user).toMatchObject({
			id: adminUserId,
			email: SUPER_ADMIN_EMAIL,
			name: "Admin Person",
		});
	});

	it("refuses a signed-in account that is not on the allowlist, and a signed-out caller", async () => {
		const ordinary = await createUserAndLogin({ email: "someone@example.test" });
		const asOrdinary = createRouterClient(superAdminRouter, { context: ordinary });
		await expect(asOrdinary.ping()).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(asOrdinary.listTeams({})).rejects.toMatchObject({ code: "FORBIDDEN" });

		const signedOut = createRouterClient(superAdminRouter, {
			context: { ...ordinary, reqHeaders: new Headers() },
		});
		await expect(signedOut.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("pages teams newest first with a total that honours the search filter", async () => {
		// Sign-ups already created personal teams; measure against them.
		const baseline = (await superAdmin.listTeams({})).total;

		const older = await db.teamsApp.create({ name: "Older Hall", createdByUserId: adminUserId });
		const newer = await db.teamsApp.create({ name: "Newer Hall", createdByUserId: adminUserId });

		const all = await superAdmin.listTeams({});
		expect(all.total).toBe(baseline + 2);
		expect(all.rows.map((t) => t.id).slice(0, 2)).toEqual([newer.id, older.id]);
		expect(all.rows.find((t) => t.id === personalTeamId)?.ownerEmail).toBe(SUPER_ADMIN_EMAIL);
		expect(all.rows.find((t) => t.id === personalTeamId)?.memberCount).toBe(1);

		const page = await superAdmin.listTeams({ limit: 1, offset: 1 });
		expect(page.total).toBe(baseline + 2);
		expect(page.rows.map((t) => t.id)).toEqual([older.id]);

		const searched = await superAdmin.listTeams({ search: "newer" });
		expect(searched.total).toBe(1);
		expect(searched.rows.map((t) => t.id)).toEqual([newer.id]);
	});

	it("shows a team's members, including one invited by email who has not signed up", async () => {
		await db.teamMembers.create({
			teamId: personalTeamId,
			email: "invitee@example.test",
			role: "Member",
		});

		const detail = await superAdmin.getTeam({ teamId: personalTeamId });
		expect(detail.team.id).toBe(personalTeamId);
		const invited = detail.members.find((m) => m.email === "invitee@example.test");
		expect(invited).toMatchObject({ userId: null, userName: null, role: "Member" });
		expect(detail.members.find((m) => m.userId === adminUserId)?.userName).toBe("Admin Person");

		await expect(
			superAdmin.getTeam({ teamId: "01HZX000000000000000000000" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("lists users and searches them by name or email", async () => {
		await createUserAndLogin({ email: "zelda.searchable@example.test", name: "Zelda Searchable" });

		const byName = await superAdmin.listUsers({ search: "zelda" });
		expect(byName.total).toBe(1);
		expect(byName.rows[0]?.email).toBe("zelda.searchable@example.test");

		const byEmail = await superAdmin.listUsers({ search: "SEARCHABLE@example" });
		expect(byEmail.rows.map((u) => u.name)).toEqual(["Zelda Searchable"]);
	});

	it("sets, lists and deletes a feature flag", async () => {
		const flag = await superAdmin.setFlag({
			key: "example.kill_switch",
			scope: "global",
			scopeId: null,
			enabled: false,
		});
		expect((await superAdmin.listFlags({ key: "example.kill_switch" })).map((f) => f.id)).toEqual([
			flag.id,
		]);
		await superAdmin.deleteFlag({ id: flag.id });
		expect(await superAdmin.listFlags({ key: "example.kill_switch" })).toEqual([]);
	});

	it("records every flag change with who, before and after, and lists it", async () => {
		const flag = await superAdmin.setFlag({
			key: "example.audited",
			scope: "global",
			scopeId: null,
			enabled: true,
		});
		await superAdmin.setFlag({
			key: "example.audited",
			scope: "global",
			scopeId: null,
			enabled: false,
		});
		await superAdmin.deleteFlag({ id: flag.id });

		const { rows } = await superAdmin.auditList({ targetKind: "flag" });
		const mine = rows.filter(
			(r) => r.targetId === "example.audited@global" || r.targetId === flag.id,
		);
		expect(mine.map((r) => r.action)).toEqual(["flags.delete", "flags.set", "flags.set"]);
		const [deleted, second, first] = mine;
		expect(first).toMatchObject({
			actorUserId: adminUserId,
			actorEmail: SUPER_ADMIN_EMAIL,
			before: null,
		});
		expect(first?.after).toMatchObject({ enabled: true });
		expect(second?.before).toMatchObject({ enabled: true });
		expect(second?.after).toMatchObject({ enabled: false });
		expect(deleted).toMatchObject({
			before: expect.objectContaining({ id: flag.id }),
			after: null,
		});
		expect(first?.ipAddress).toBeTypeOf("string");
	});

	it("writes no audit row for a refused change", async () => {
		const before = (await superAdmin.auditList({})).total;
		await expect(
			superAdmin.setFlag({
				key: "example.bad",
				scope: "global",
				scopeId: "01HZX000000000000000000000",
				enabled: true,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect((await superAdmin.auditList({})).total).toBe(before);
	});

	it("rolls the change back when its audit row cannot be written", async () => {
		const create = vi
			.spyOn(db.operatorAuditLog, "create")
			.mockRejectedValueOnce(new Error("audit write failed"));
		try {
			await expect(
				superAdmin.setFlag({
					key: "example.unrecorded",
					scope: "global",
					scopeId: null,
					enabled: true,
				}),
			).rejects.toThrow();
		} finally {
			create.mockRestore();
		}
		expect(await superAdmin.listFlags({ key: "example.unrecorded" })).toEqual([]);
	});

	it("refuses the audit trail to an ordinary user", async () => {
		const ordinary = await createUserAndLogin({ email: "nosy@example.test" });
		const asOrdinary = createRouterClient(superAdminRouter, { context: ordinary });
		await expect(asOrdinary.auditList({})).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("signs an account out everywhere, with the reason on record", async () => {
		const target = await createUserAndLogin({ email: "compromised@example.test" });
		// A second session for the same account (createUserAndLogin's password).
		await auth.api.signInEmail({
			body: { email: "compromised@example.test", password: "password123" },
		});
		const live = Number(await db.sessions.where({ userId: target.user.id }).count());
		expect(live).toBeGreaterThanOrEqual(2);

		const res = await superAdmin.revokeUserSessions({
			userId: target.user.id,
			reason: "phone stolen",
		});
		expect(res.ended).toBe(live);
		expect(
			Number(await db.sessions.unscope("default").where({ userId: target.user.id }).count()),
		).toBe(0);
		expect(
			await auth.api.getSession({
				headers: target.reqHeaders,
				query: { disableCookieCache: true },
			}),
		).toBeNull();
		// The signed cookie copy is refused too, not only the row.
		expect(await isSessionRevoked(target.session.id)).toBe(true);

		const { rows } = await superAdmin.auditList({ targetKind: "user", targetId: target.user.id });
		expect(rows[0]).toMatchObject({
			action: "users.revokeSessions",
			reason: "phone stolen",
			before: { liveSessions: live },
			after: { ended: live },
		});
	});

	it("refuses a missing reason, an operator's own account and an ordinary caller", async () => {
		const target = await createUserAndLogin({ email: "other@example.test" });
		await expect(
			superAdmin.revokeUserSessions({ userId: target.user.id, reason: "" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			superAdmin.revokeUserSessions({ userId: adminUserId, reason: "testing" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		const asOrdinary = createRouterClient(superAdminRouter, { context: target });
		await expect(
			asOrdinary.revokeUserSessions({ userId: adminUserId, reason: "testing" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(
			Number(await db.sessions.where({ userId: target.user.id }).count()),
		).toBeGreaterThanOrEqual(1);
	});
});
