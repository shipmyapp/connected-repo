import { db } from "@backend/db/db";
import {
	ACCOUNT_EXPORT_ROW_CAP,
	type AccountExport,
} from "@connected-repo/zod-schemas/account.zod";

/**
 * A person's own data as one JSON document (access and portability). Files
 * are listed with their links, not embedded. Never contains a secret: no
 * session token, OAuth token, push address, device key or API key — every
 * column is named here on purpose; never `selectAll()` in this file.
 * Soft-deleted memberships, entries and files are not exported (the
 * soft-delete filter stays on after the tenant scope is lifted).
 */
export async function exportAccountData(userId: string, now = Date.now()): Promise<AccountExport> {
	const cap = ACCOUNT_EXPORT_ROW_CAP;
	const truncated: string[] = [];
	const capped = <T>(name: string, rows: T[]): T[] => {
		if (rows.length <= cap) return rows;
		truncated.push(name);
		return rows.slice(0, cap);
	};

	const account = await db.users
		.find(userId)
		.select(
			"id",
			"name",
			"email",
			"emailVerified",
			"phoneNumber",
			"phoneNumberVerified",
			"image",
			"timezone",
			"themeSetting",
			"journalReminderTimes",
			"asks",
			"legalAcceptedVersion",
			"legalAcceptedAt",
			"deletionRequestedAt",
			"createdAt",
			"updatedAt",
		);

	const [signInMethods, memberRows, journalEntries, files, devices, sessions, consents, actions] =
		await Promise.all([
			db.accounts.where({ userId }).select("providerId", "createdAt"),
			db.teamMembers
				.unscope("default")
				.where({ userId })
				.select("teamId", "role", "addedAt", "joinedAt")
				.limit(cap + 1),
			db.journalEntries
				.unscope("default")
				.where({ authorUserId: userId })
				.select("id", "teamId", "promptId", "prompt", "content", "createdAt", "updatedAt")
				.order({ createdAt: "ASC" })
				.limit(cap + 1),
			db.files
				.unscope("default")
				.where({ createdByUserId: userId })
				.select(
					"id",
					"teamId",
					"tableName",
					"tableId",
					"type",
					"fileName",
					"mimeType",
					"cdnUrl",
					"thumbnailCdnUrl",
					"createdAt",
				)
				.order({ createdAt: "ASC" })
				.limit(cap + 1),
			db.devices
				.where({ userId })
				.select(
					"platform",
					"browser",
					"os",
					"model",
					"osVersion",
					"isStandalone",
					"installedAt",
					"openedInstalledAt",
					"pushPermission",
					"pushOffAt",
					"pushOffReason",
					"firstSeenAt",
					"lastSeenAt",
				)
				.limit(cap + 1),
			db.sessions
				.where({ userId })
				.select(
					"id",
					"createdAt",
					"updatedAt",
					"expiresAt",
					"ipAddress",
					"userAgent",
					"browser",
					"os",
					"device",
				)
				.limit(cap + 1),
			db.oauthConsents.where({ userId }).select("clientId", "scopes", "createdAt", "updatedAt"),
			db.connectedAppActions
				.where({ userId })
				.select(
					"clientId",
					"teamId",
					"tool",
					"what",
					"request",
					"entityTable",
					"entityId",
					"createdAt",
				)
				.order({ createdAt: "DESC" })
				.limit(cap + 1),
		]);

	const memberships = capped("memberships", memberRows);
	const teamIds = [...new Set(memberships.map((m) => m.teamId))];
	const teams = teamIds.length
		? await db.teamsApp
				.includeDeleted()
				.where({ id: { in: teamIds } })
				.select("id", "name")
		: [];
	const teamName = new Map(teams.map((t) => [t.id, t.name]));

	const clientIds = [...new Set(consents.map((c) => c.clientId))];
	const clients = clientIds.length
		? await db.oauthClients.where({ clientId: { in: clientIds } }).select("clientId", "name", "uri")
		: [];
	const clientOf = new Map(clients.map((c) => [c.clientId, c]));

	return {
		format: "account-export/1",
		exportedAt: now,
		truncated,
		account,
		signInMethods,
		memberships: memberships.map((m) => ({ ...m, teamName: teamName.get(m.teamId) ?? null })),
		journalEntries: capped("journalEntries", journalEntries),
		files: capped("files", files),
		devices: capped("devices", devices),
		sessions: capped("sessions", sessions),
		connectedApps: consents.map((c) => ({
			...c,
			name: clientOf.get(c.clientId)?.name ?? null,
			uri: clientOf.get(c.clientId)?.uri ?? null,
		})),
		connectedAppActions: capped("connectedAppActions", actions),
	};
}
