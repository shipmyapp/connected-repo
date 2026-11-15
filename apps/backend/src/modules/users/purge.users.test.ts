import { sql } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { tbus } from "@backend/events/tbus";
import { requestContext } from "@backend/lib/request-context";
import { createTeamService } from "@backend/modules/teams/services/create_team.teams.service";
import { defaultContext } from "@backend/test/setup";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { generatePublicUrl } from "@backend/utils/cdn.utils";
import { ulid } from "ulid";
import { describe, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "./services/deletion.users.service";
import { purgeAccount } from "./services/purge.users.service";

type Ctx = Awaited<ReturnType<typeof createUserAndLogin>>;

const requireContext = (): Ctx => {
	if (!defaultContext) throw new Error("test context missing");
	return defaultContext;
};

const DAY_MS = 86_400_000;

/** Writes a row the way a request in `teamId` would (setOnCreate stamps teamId from here). */
const asMemberOf = <T>(teamId: string, userId: string, fn: () => Promise<T>) =>
	requestContext.run(
		{ tenantTeamId: teamId, userId, teamMemberId: "system", teamMemberRole: "system" },
		fn,
	);

const personalTeamOf = async (userId: string) =>
	(await db.teamsApp.where({ personalTeamForUserId: userId }).select("id").take()).id;

/** One journal entry with one attachment, in `teamId`, by `userId`. */
const entryWithFile = async (teamId: string, userId: string, key: string, thumbKey?: string) =>
	asMemberOf(teamId, userId, async () => {
		const entry = await db.journalEntries.create({
			id: ulid(),
			content: `by ${userId}`,
			authorUserId: userId,
		});
		await db.files.create({
			id: ulid(),
			tableName: "journalEntries",
			tableId: entry.id,
			type: "attachment",
			fileName: "f.png",
			mimeType: "image/png",
			createdByUserId: userId,
			cdnUrl: generatePublicUrl(key),
			thumbnailCdnUrl: thumbKey ? generatePublicUrl(thumbKey) : null,
		});
		return entry;
	});

/**
 * One row for `userId` in every user-owned table that has no row for them
 * yet (accounts, sessions, users, the personal team and its membership
 * exist from sign-up).
 */
const fillUserOwnedTables = async (userId: string, tag: string) => {
	const now = Date.now();
	const clientId = `client-${tag}-${ulid()}`;
	await db.oauthClients.create({
		id: ulid(),
		clientId,
		userId,
		redirectUris: ["https://example.com/cb"],
	});
	const refresh = await db.oauthRefreshTokens.create({
		token: `rt-${tag}-${ulid()}`,
		clientId,
		userId,
		expiresAt: new Date(now + DAY_MS),
		scopes: ["read"],
	});
	await db.oauthAccessTokens.create({
		token: `at-${tag}-${ulid()}`,
		clientId,
		userId,
		refreshId: refresh.id,
		expiresAt: new Date(now + DAY_MS),
		scopes: ["read"],
	});
	await db.oauthConsents.create({ clientId, userId, scopes: ["read"] });
	await db.connectedAppActions.create({
		userId,
		clientId,
		tool: "create_entry",
		what: "Wrote an entry",
	});
	await db.devices.create({
		id: ulid(),
		userId,
		deviceKey: tag.repeat(22).slice(0, 22),
		platform: "desktop",
		fcmToken: `fcm-${tag}-${ulid()}`,
		firstSeenAt: now,
		lastSeenAt: now,
	});
	await db.pushDevices.create({ userId, fcmToken: `legacy-fcm-${tag}-${ulid()}`, lastSeenAt: now });
};

/** Every column on the real schema that names an account (foreign key or not). */
const PERSON_COLUMNS: [table: string, column: string][] = [
	["users", "id"],
	["accounts", "user_id"],
	["sessions", "user_id"],
	["devices", "user_id"],
	["push_devices", "user_id"],
	["files", "created_by_user_id"],
	["journal_entries", "author_user_id"],
	["team_members", "user_id"],
	["teams_app", "created_by_user_id"],
	["teams_app", "personal_team_for_user_id"],
	["oauth_clients", "user_id"],
	["oauth_access_tokens", "user_id"],
	["oauth_refresh_tokens", "user_id"],
	["oauth_consents", "user_id"],
	["connected_app_actions", "user_id"],
];

const rowsNaming = async (userId: string): Promise<Record<string, number>> => {
	const out: Record<string, number> = {};
	for (const [table, column] of PERSON_COLUMNS) {
		// Identifiers from the constant above, never from input.
		const result = await db.$query<{ n: number }>(
			sql({
				raw: `SELECT count(*)::int AS n FROM ${table} WHERE ${column}::text = $id`,
				values: { id: userId },
			}),
		);
		out[`${table}.${column}`] = result.rows[0]?.n ?? -1;
	}
	return out;
};

describe("purgeAccount", () => {
	it("knows every foreign key to users on the real schema", async () => {
		const result = await db.$query<{ table: string; column: string }>`
			SELECT c.conrelid::regclass::text AS table, a.attname AS column
			FROM pg_constraint c
			JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
			WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
		`;
		const known = new Set(PERSON_COLUMNS.map(([t, c]) => `${t}.${c}`));
		// A new table that names a person needs a line in purgeAccount (or a
		// CASCADE) and here.
		expect(result.rows.map((r) => `${r.table}.${r.column}`).filter((k) => !known.has(k))).toEqual(
			[],
		);
	});

	it("a purge never touches a shared team or other people's data", async () => {
		const a = requireContext();
		const b = await createUserAndLogin();
		const aEmail = a.user.email ?? "";

		// A creates "Shared"; B joins as an Owner; A leaves (directly, so the
		// test does not depend on the leave rules).
		const shared = await createTeamService(a.user.id, aEmail, null, { name: "Shared" });
		await db.teamMembers.create({
			teamId: shared.id,
			userId: b.user.id,
			email: b.user.email,
			role: "Owner",
			joinedAt: Date.now(),
		});
		const aShared = await entryWithFile(shared.id, a.user.id, "x/a.png");
		const bShared = await entryWithFile(shared.id, b.user.id, "x/b.png");
		await db.teamMembers
			.unscope("default")
			.where({ teamId: shared.id, userId: a.user.id })
			.delete();

		const aPersonal = await personalTeamOf(a.user.id);
		const bPersonal = await personalTeamOf(b.user.id);
		await entryWithFile(aPersonal, a.user.id, "p/a.png", "p/a_t.png");
		const bOwn = await entryWithFile(bPersonal, b.user.id, "p/b.png");
		await fillUserOwnedTables(a.user.id, "a");
		await fillUserOwnedTables(b.user.id, "b");
		// An operator's record about A stays (append-only, no foreign key).
		await db.operatorAuditLog.create({
			actorUserId: b.user.id,
			actorEmail: b.user.email,
			action: "users.revokeSessions",
			targetKind: "user",
			targetId: a.user.id,
		});

		await db.users.find(b.user.id).update({ activeTeamAppId: shared.id });

		await requestAccountDeletion({ userId: a.user.id, currentSessionId: a.session.id });
		await db.users.find(a.user.id).update({ deletionRequestedAt: Date.now() - 31 * DAY_MS });
		vi.mocked(tbus.publish).mockClear();

		expect(await purgeAccount(a.user.id)).toBe("purged");

		// Nothing of A is left in any table that names a person.
		const leftOfA = await rowsNaming(a.user.id);
		expect(Object.entries(leftOfA).filter(([, n]) => n !== 0)).toEqual([]);
		expect(
			await db.teamMembers.unscope("default").includeDeleted().where({ email: aEmail }).count(),
		).toBe(0);
		expect(
			await db.journalEntries.unscope("default").includeDeleted().where({ id: aShared.id }).count(),
		).toBe(0);
		expect(await db.teamsApp.includeDeleted().where({ id: aPersonal }).count()).toBe(0);

		// The shared team and B are untouched.
		const team = await db.teamsApp.find(shared.id);
		expect(team.createdByUserId).toBeNull();
		expect(team.deletedAt).toBeNull();
		const bMembership = await db.teamMembers
			.unscope("default")
			.where({ teamId: shared.id, userId: b.user.id })
			.take();
		expect(bMembership.role).toBe("Owner");
		const bRow = await db.users.find(b.user.id).select("activeTeamAppId");
		expect(bRow.activeTeamAppId).toBe(shared.id);
		for (const entry of [bShared, bOwn]) {
			expect(await db.journalEntries.unscope("default").where({ id: entry.id }).count()).toBe(1);
			expect(await db.files.unscope("default").where({ tableId: entry.id }).count()).toBe(1);
		}
		const leftOfB = await rowsNaming(b.user.id);
		for (const [key, n] of Object.entries(leftOfB)) {
			if (key === "teams_app.created_by_user_id") continue; // B created only a personal team
			expect(n, key).toBeGreaterThan(0);
		}
		expect(await db.operatorAuditLog.where({ targetId: a.user.id }).count()).toBe(1);

		// A's bucket objects are queued; B's are not.
		const queued = await db.storageObjectDeletions.pluck("objectKey");
		expect(queued.sort()).toEqual(["p/a.png", "p/a_t.png", "x/a.png"].sort());

		// The Novu subscriber goes through the user.deleted event.
		const published = vi.mocked(tbus.publish).mock.calls.map(([event]) => event);
		expect(published).toContainEqual(
			expect.objectContaining({ event_name: "user.deleted", data: { userId: a.user.id } }),
		);

		// The device the account used is told to erase its copy.
		expect(await db.erasedDeviceKeys.where({ deviceKey: "a".repeat(22) }).exists()).toBe(true);
	});

	it("waits for the grace period unless forced", async () => {
		const a = requireContext();
		await requestAccountDeletion({ userId: a.user.id, currentSessionId: a.session.id });
		await db.users.find(a.user.id).update({ deletionRequestedAt: Date.now() - 29 * DAY_MS });
		expect(await purgeAccount(a.user.id)).toBe("not_due");
		expect(await db.users.findOptional(a.user.id)).toBeDefined();
		expect(await purgeAccount(a.user.id, { force: true })).toBe("purged");
		expect(await db.users.findOptional(a.user.id)).toBeUndefined();
	});

	it("never purges an account that has not asked, even forced", async () => {
		const a = requireContext();
		expect(await purgeAccount(a.user.id, { force: true })).toBe("not_due");
		expect(await db.users.findOptional(a.user.id)).toBeDefined();
	});

	it("skips an account that joined a shared team after asking, deleting nothing", async () => {
		const a = requireContext();
		const b = await createUserAndLogin();
		await requestAccountDeletion({ userId: a.user.id, currentSessionId: a.session.id });
		await db.users.find(a.user.id).update({ deletionRequestedAt: Date.now() - 31 * DAY_MS });
		const team = await createTeamService(b.user.id, b.user.email, null, { name: "B's" });
		await db.teamMembers.create({
			teamId: team.id,
			userId: a.user.id,
			email: a.user.email,
			role: "Member",
			joinedAt: Date.now(),
		});
		expect(await purgeAccount(a.user.id)).toBe("blocked");
		expect(await db.users.findOptional(a.user.id)).toBeDefined();
		expect(await db.sessions.unscope("default").where({ userId: a.user.id }).count()).toBe(1);
	});

	it("answers gone for an account that no longer exists", async () => {
		expect(await purgeAccount("00000000-0000-4000-8000-000000000000")).toBe("gone");
	});
});
