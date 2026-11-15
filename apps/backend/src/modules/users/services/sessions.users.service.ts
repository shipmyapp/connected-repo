import { db } from "@backend/db/db";
import { markSessionRevoked } from "@backend/modules/auth/services/revoked_sessions.auth.service";
import { pushOffDevice } from "@backend/modules/devices/services/push.devices.service";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { describeClientDevice } from "@backend/utils/client-info.utils";
import type { AccountSession } from "@connected-repo/zod-schemas/account.zod";
import { ORPCError } from "@orpc/server";

/**
 * The account's live sessions, this one first, then by last activity. Only
 * ids leave the server. Sessions opened before the session-create hook wrote
 * browser/os/device are described from their stored user agent.
 * "Last active" is the later of the session's own refresh (Better Auth renews
 * it at most daily) and its device's last report.
 */
export async function listAccountSessions(
	userId: string,
	currentSessionId: string,
): Promise<AccountSession[]> {
	const [rows, devices] = await Promise.all([
		db.sessions
			.where({ userId })
			.select(
				"id",
				"browser",
				"os",
				"device",
				"userAgent",
				"deviceKey",
				"createdAt",
				"updatedAt",
				"expiresAt",
			),
		db.devices.where({ userId }).select("deviceKey", "lastSeenAt"),
	]);
	const lastSeenByKey = new Map(devices.map((d) => [d.deviceKey, d.lastSeenAt]));
	return rows
		.map((row) => {
			const parsed =
				row.browser || row.os || !row.userAgent
					? null
					: describeClientDevice(new Headers({ "user-agent": row.userAgent }));
			const deviceSeen = row.deviceKey ? (lastSeenByKey.get(row.deviceKey) ?? 0) : 0;
			return {
				id: row.id,
				current: row.id === currentSessionId,
				browser: row.browser ?? parsed?.browser ?? null,
				os: row.os ?? parsed?.os ?? null,
				device: row.device ?? parsed?.device ?? null,
				createdAt: row.createdAt,
				lastActiveAt: Math.max(row.updatedAt, deviceSeen),
				expiresAt: row.expiresAt,
			};
		})
		.sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt - a.lastActiveAt);
}

/** Push stops on a device whose last session of this account just ended. */
async function pushOffIfNoSessionLeft(userId: string, deviceKey: string | null): Promise<void> {
	if (!deviceKey) return;
	const stillSignedIn = await db.sessions.where({ userId, deviceKey }).exists();
	if (stillSignedIn) return;
	try {
		await pushOffDevice({ userId, deviceKey, reason: "signed_out" });
	} catch (error) {
		captureBackendException(error, { tags: { handler: "session_revoke_push_off" } });
	}
}

/**
 * Ends one other session of the account. Its next call is refused at once
 * (the revocation mark; up to five minutes if Redis is down).
 */
export async function revokeAccountSession(params: {
	userId: string;
	currentSessionId: string;
	sessionId: string;
}): Promise<void> {
	const { userId, currentSessionId, sessionId } = params;
	if (sessionId === currentSessionId) {
		throw new ORPCError("BAD_REQUEST", {
			status: 400,
			message: "Use Sign out to end this device's session.",
		});
	}
	const target = await db.sessions
		.unscope("default")
		.where({ id: sessionId, userId })
		.select("id", "deviceKey")
		.takeOptional();
	if (!target) throw new ORPCError("NOT_FOUND", { status: 404, message: "Session not found." });
	await db.sessions.unscope("default").where({ id: target.id }).delete();
	// An Orchid delete runs no Better Auth hook: mark it revoked ourselves.
	await markSessionRevoked(target.id);
	await pushOffIfNoSessionLeft(userId, target.deviceKey);
}

/**
 * Ends every session of the account except this one. Returns how many ended.
 * Connected apps keep their access: they are disconnected on their own card.
 */
export async function revokeOtherAccountSessions(
	userId: string,
	currentSessionId: string,
): Promise<number> {
	const others = await db.sessions
		.unscope("default")
		.where({ userId, id: { not: currentSessionId } })
		.select("id", "deviceKey");
	if (others.length === 0) return 0;
	await db.sessions
		.unscope("default")
		.where({ id: { in: others.map((s) => s.id) } })
		.delete();
	await Promise.all(others.map((s) => markSessionRevoked(s.id)));
	for (const key of new Set(others.map((s) => s.deviceKey))) {
		await pushOffIfNoSessionLeft(userId, key);
	}
	return others.length;
}
