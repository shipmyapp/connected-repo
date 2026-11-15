import { randomBytes } from "node:crypto";
import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { DEVICE_COOKIE } from "@backend/modules/devices/device_cookie.devices.middleware";
import {
	hashOAuthToken,
	OAUTH_TOKEN_PREFIX,
	userMcpResourceUrl,
} from "@backend/modules/user_mcp/oauth.user_mcp.config";
import { principalFromBearer } from "@backend/modules/user_mcp/services/principal.user_mcp.service";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import { defaultContext } from "@backend/test/setup";
import { createSharedTeam, teamsClient } from "@backend/test/utils/team.utils";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { transformSessionAndUserData } from "@backend/utils/session.utils";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@connected-repo/zod-schemas/account.zod";
import { LEGAL_VERSION } from "@connected-repo/zod-schemas/legal.zod";
import { call, createRouterClient, isProcedure } from "@orpc/server";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";

type Ctx = Awaited<ReturnType<typeof createUserAndLogin>>;

const requireContext = (): Ctx => {
	if (!defaultContext) throw new Error("test context missing");
	return defaultContext;
};

/** Headers without Better Auth's 5-minute cookie copy, so the next call reads the rows. */
const withoutCookieCache = (headers: Headers): Headers => {
	const out = new Headers(headers);
	const cookie = (headers.get("cookie") ?? "")
		.split(";")
		.map((p) => p.trim())
		.filter((p) => p && !p.split("=")[0]?.endsWith(".session_data"))
		.join("; ");
	out.set("cookie", cookie);
	return out;
};

/** The same login, its user read from the rows (as a request after the cookie copy expires). */
const fresh = async (ctx: Ctx): Promise<Ctx> => {
	const reqHeaders = withoutCookieCache(ctx.reqHeaders);
	const data = await auth.api.getSession({ headers: reqHeaders });
	if (!data) throw new Error("no session");
	return { ...transformSessionAndUserData(data), reqHeaders };
};

const app = (ctx: Ctx) => createRouterClient(userAppRouter, { context: ctx });

describe("account deletion: teams first", () => {
	it("has no blockers for a fresh account (only its personal team)", async () => {
		await expect(app(requireContext()).account.deletionBlockers()).resolves.toEqual([]);
	});

	it("refuses while the person owns a shared team, naming it", async () => {
		const ctx = requireContext();
		await teamsClient(ctx).createTeam({ name: "Shared" });
		await expect(app(ctx).account.requestDeletion()).rejects.toMatchObject({
			status: 409,
			code: "LEAVE_TEAMS_FIRST",
			data: {
				blockers: [
					expect.objectContaining({
						name: "Shared",
						role: "Owner",
						kind: "shared_team",
						canDelete: true,
						canLeave: false,
					}),
				],
			},
		});
		const row = await db.users.find(ctx.user.id).select("deletionRequestedAt");
		expect(row.deletionRequestedAt).toBeNull();
	});

	it("refuses while someone else is in the personal team", async () => {
		const ctx = requireContext();
		const personalId = ctx.user.activeTeamAppId as string;
		// Rows from before personal teams refused members.
		await db.teamMembers.create({
			teamId: personalId,
			email: `pending-${ulid().toLowerCase()}@example.com`,
			role: "Member",
		});
		await expect(app(ctx).account.requestDeletion()).rejects.toMatchObject({
			status: 409,
			code: "LEAVE_TEAMS_FIRST",
			data: { blockers: [expect.objectContaining({ kind: "personal_team_has_members" })] },
		});
	});

	it("lets a Member leave, then delete; the grace period is 30 days", async () => {
		const ctx = requireContext();
		const { teamId, owner } = await createSharedTeam(ctx, "Owned by A");
		const email = `b-${ulid().toLowerCase()}@example.com`;
		await teamsClient(owner).addTeamMember({ email, role: "Member" });
		const b = await createUserAndLogin({ email });
		await teamsClient(b).getMyTeams();

		const blockers = await app(b).account.deletionBlockers();
		expect(blockers).toEqual([
			expect.objectContaining({ teamId, role: "Member", canLeave: true, canDelete: false }),
		]);
		await expect(app(b).account.requestDeletion()).rejects.toMatchObject({ status: 409 });

		await teamsClient(b).leaveTeam({ teamId });
		const result = await app(b).account.requestDeletion();
		expect(result.purgeAfter - result.deletionRequestedAt).toBe(
			ACCOUNT_DELETION_GRACE_DAYS * 86_400_000,
		);
		expect(ACCOUNT_DELETION_GRACE_DAYS).toBe(30);
	});
});

describe("account deletion: the request", () => {
	it("ends every other session and keeps the current one", async () => {
		const ctx = requireContext();
		const other = await auth.api.signInEmail({
			body: { email: ctx.user.email ?? "", password: "password123" },
		});
		expect(other.token).toBeTruthy();
		expect(await db.sessions.where({ userId: ctx.user.id }).count()).toBeGreaterThan(1);

		await app(ctx).account.requestDeletion();

		const left = await db.sessions.unscope("default").where({ userId: ctx.user.id }).pluck("id");
		expect(left).toEqual([ctx.session.id]);
	});

	it("ends a connected app: its token is refused afterwards", async () => {
		const ctx = requireContext();
		const clientId = `client-${ulid()}`;
		await db.oauthClients.create({
			id: ulid(),
			clientId,
			name: "Some AI app",
			redirectUris: ["https://example.com/callback"],
		});
		await db.oauthConsents.create({ clientId, userId: ctx.user.id, scopes: ["read"] });
		const raw = randomBytes(24).toString("base64url");
		await db.oauthAccessTokens.create({
			token: hashOAuthToken(raw),
			clientId,
			userId: ctx.user.id,
			expiresAt: new Date(Date.now() + 3_600_000),
			scopes: ["read"],
		});
		const presented = `${OAUTH_TOKEN_PREFIX.opaqueAccessToken}${raw}`;
		const before = await principalFromBearer(presented, userMcpResourceUrl());
		expect(typeof before).toBe("object");

		await app(ctx).account.requestDeletion();

		expect(await principalFromBearer(presented, userMcpResourceUrl())).toBe("unknown");
		expect(await db.oauthConsents.where({ userId: ctx.user.id }).count()).toBe(0);

		// Even a token that survived would act for no one while the deletion is pending.
		const raw2 = randomBytes(24).toString("base64url");
		await db.oauthConsents.create({ clientId, userId: ctx.user.id, scopes: ["read"] });
		await db.oauthAccessTokens.create({
			token: hashOAuthToken(raw2),
			clientId,
			userId: ctx.user.id,
			expiresAt: new Date(Date.now() + 3_600_000),
			scopes: ["read"],
		});
		expect(
			await principalFromBearer(
				`${OAUTH_TOKEN_PREFIX.opaqueAccessToken}${raw2}`,
				userMcpResourceUrl(),
			),
		).toBe("account");
	});

	it("turns push off on every device", async () => {
		const ctx = requireContext();
		const now = Date.now();
		await db.devices.create({
			id: ulid(),
			userId: ctx.user.id,
			deviceKey: "p".repeat(22),
			platform: "android",
			fcmToken: `fcm-${ulid()}`,
			firstSeenAt: now,
			lastSeenAt: now,
		});
		await app(ctx).account.requestDeletion();
		const device = await db.devices.where({ userId: ctx.user.id }).take();
		expect(device.pushOffAt).not.toBeNull();
		expect(device.pushOffReason).toBe("signed_out");
	});

	it("restricts the account to cancelDeletion until it is kept", async () => {
		const ctx = requireContext();
		await app(ctx).account.requestDeletion();
		const pending = await fresh(ctx);
		expect(pending.user.deletionRequestedAt).not.toBeNull();

		await expect(app(pending).teams.getMyTeams()).rejects.toMatchObject({
			status: 403,
			code: "ACCOUNT_DELETION_PENDING",
		});
		await expect(app(pending).account.cancelDeletion()).resolves.toEqual({ ok: true });

		const kept = await fresh(ctx);
		await expect(app(kept).teams.getMyTeams()).resolves.toBeInstanceOf(Array);
	});

	it("answers ACCOUNT_DELETION_PENDING on every procedure but the cancel and the public ones", async () => {
		const ctx = requireContext();
		await app(ctx).account.requestDeletion();
		const pending = await fresh(ctx);

		// Every procedure built on rpcProtectedProcedure carries its middlewares
		// first, the deletion gate among them.
		const gate = rpcProtectedProcedure["~orpc"].middlewares;
		const ungated: string[] = [];
		const answered: Record<string, unknown> = {};
		const walk = async (node: unknown, path: string[]): Promise<void> => {
			const name = path.join(".");
			if (isProcedure(node)) {
				const chain = node["~orpc"].middlewares;
				if (!gate.every((m, i) => chain[i] === m)) {
					ungated.push(name);
					return;
				}
				// Input is validated before middlewares: a procedure that needs
				// input refuses `{}` as a 400 before the gate can answer.
				try {
					await call(node, {}, { context: pending });
					answered[name] = "resolved";
				} catch (error) {
					const { code, status } = error as { code?: unknown; status?: unknown };
					answered[name] = code === "ACCOUNT_DELETION_PENDING" || status === 400 ? "refused" : code;
				}
				return;
			}
			if (typeof node === "object" && node !== null) {
				for (const [key, child] of Object.entries(node)) await walk(child, [...path, key]);
			}
		};
		await walk(userAppRouter, []);

		// Every one of these is public (no session needed), except the cancel.
		expect(ungated.sort()).toEqual(
			[
				"account.ackLocalDataErasure",
				"account.cancelDeletion",
				"account.localDataErasure",
				"health",
				"prompts.getById",
				"teams.getBrandingBySlug",
			].sort(),
		);
		expect(Object.values(answered).every((v) => v === "refused")).toBe(true);
		expect(answered["teams.getMyTeams"]).toBe("refused");
	});

	it("gives the person's own device the restriction too (the procedure, not the client, decides)", async () => {
		const ctx = requireContext();
		await app(ctx).account.requestDeletion();
		const pending = await fresh(ctx);
		await expect(app(pending).account.exportData()).rejects.toMatchObject({
			code: "ACCOUNT_DELETION_PENDING",
		});
		await expect(app(pending).account.requestDeletion()).rejects.toMatchObject({
			code: "ACCOUNT_DELETION_PENDING",
		});
	});
});

describe("sensitive acts need a recent sign-in", () => {
	it("refuses a session older than 10 minutes with the providers to sign in again with", async () => {
		const ctx = requireContext();
		await db.sessions.find(ctx.session.id).update({ createdAt: Date.now() - 11 * 60_000 });
		const stale = { ...ctx, reqHeaders: withoutCookieCache(ctx.reqHeaders) };
		await expect(app(stale).account.exportData()).rejects.toMatchObject({
			status: 403,
			code: "REAUTH_REQUIRED",
			data: { providers: expect.arrayContaining(["credential"]) },
		});
		await expect(app(stale).account.requestDeletion()).rejects.toMatchObject({
			status: 403,
			code: "REAUTH_REQUIRED",
		});
		const row = await db.users.find(ctx.user.id).select("deletionRequestedAt");
		expect(row.deletionRequestedAt).toBeNull();
	});

	it("refuses a session whose row is gone, even while its cookie copy is valid", async () => {
		const ctx = requireContext();
		// Straight to the database: no revocation mark, so only the row read catches it.
		await db.sessions.unscope("default").find(ctx.session.id).delete();
		await expect(app(ctx).account.exportData()).rejects.toMatchObject({ status: 401 });
	});
});

describe("terms and privacy", () => {
	it("records the current version only", async () => {
		const ctx = requireContext();
		const result = await app(ctx).account.acceptLegal({ version: LEGAL_VERSION });
		expect(result.legalAcceptedVersion).toBe(LEGAL_VERSION);
		const row = await db.users.find(ctx.user.id).select("legalAcceptedVersion", "legalAcceptedAt");
		expect(row.legalAcceptedVersion).toBe(LEGAL_VERSION);
		expect(row.legalAcceptedAt).toBe(result.legalAcceptedAt);

		await expect(
			// @ts-expect-error only the current version type-checks
			app(ctx).account.acceptLegal({ version: "1999-01-01" }),
		).rejects.toMatchObject({ status: 400, message: "Input validation failed" });
	});
});

describe("invitations during the grace period", () => {
	it("look the same to the inviter, and are claimed only once the account is kept", async () => {
		const ctx = requireContext();
		const email = `pending-${ulid().toLowerCase()}@example.com`;
		const b = await createUserAndLogin({ email });
		await app(b).account.requestDeletion();

		const { teamId, owner } = await createSharedTeam(ctx, "Inviting team");
		const row = await teamsClient(owner).addTeamMember({ email, role: "Member" });
		expect(row.userId).toBeNull();
		expect(row.joinedAt).toBeNull();

		const pending = await fresh(b);
		await expect(teamsClient(pending).getMyTeams()).rejects.toMatchObject({ status: 403 });
		const still = await db.teamMembers.unscope("default").where({ teamId, email }).take();
		expect(still.userId).toBeNull();

		await app(pending).account.cancelDeletion();
		const kept = await fresh(b);
		const teams = await teamsClient(kept).getMyTeams();
		expect(teams.map((t) => t.id)).toContain(teamId);
	});
});

describe("local data erasure", () => {
	it("tells a device whose key the purge recorded to erase, then forgets it", async () => {
		const deviceKey = randomBytes(16).toString("base64url");
		expect(deviceKey).toHaveLength(22);
		const reqHeaders = new Headers({
			cookie: `${DEVICE_COOKIE}=${deviceKey}.0`,
			"x-client-ip": "198.51.100.7",
		});
		const client = createRouterClient(userAppRouter, { context: { reqHeaders } });
		await expect(client.account.localDataErasure()).resolves.toEqual({ erase: false });
		await db.erasedDeviceKeys.create({ deviceKey });
		await expect(client.account.localDataErasure()).resolves.toEqual({ erase: true });
		await expect(client.account.ackLocalDataErasure()).resolves.toEqual({ ok: true });
		await expect(client.account.localDataErasure()).resolves.toEqual({ erase: false });
	});

	it("forgets a device key when anyone signs in on that device", async () => {
		const ctx = requireContext();
		const deviceKey = randomBytes(16).toString("base64url");
		await db.erasedDeviceKeys.create({ deviceKey });
		await auth.api.signInEmail({
			body: { email: ctx.user.email ?? "", password: "password123" },
			headers: new Headers({ cookie: `${DEVICE_COOKIE}=${deviceKey}.0` }),
		});
		expect(await db.erasedDeviceKeys.where({ deviceKey }).exists()).toBe(false);
	});
});
