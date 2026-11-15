import { db } from "@backend/db/db";
import { markSessionRevoked } from "@backend/modules/auth/services/revoked_sessions.auth.service";
import type {
	SuperAdminListInput,
	SuperAdminUserListOutput,
} from "@connected-repo/zod-schemas/super_admin.zod";

/** Every account, newest first, searched by name or email (case-insensitive). */
export async function listUsersForAdmin(
	input: SuperAdminListInput,
): Promise<SuperAdminUserListOutput> {
	const search = input.search?.trim();
	// Same split as listTeamsForAdmin: count the filter, order only the page.
	let filtered = db.users;
	if (search) {
		filtered = filtered.where({
			OR: [{ name: { contains: search } }, { email: { contains: search } }],
		});
	}
	const [rows, total] = await Promise.all([
		filtered
			.select("id", "name", "email", "phoneNumber", "createdAt")
			.order({ createdAt: "DESC", id: "DESC" })
			.limit(input.limit)
			.offset(input.offset),
		filtered.count(),
	]);
	return { rows, total: Number(total) };
}

/**
 * Ends every session of an account (the first move on a compromised one).
 * Through `unscope("default")`: the sessions table's default scope hides
 * expired and marked-invalid rows, and they go too. Each ended session is
 * marked revoked, so its signed cookie copy stops working at once instead of
 * at the end of the cookie cache. Returns how many rows went.
 */
export async function revokeAllSessionsForAdmin(userId: string): Promise<{ ended: number }> {
	const ids = await db.sessions.unscope("default").where({ userId }).pluck("id");
	const ended = await db.sessions.unscope("default").where({ userId }).delete();
	await Promise.all(ids.map((id) => markSessionRevoked(id)));
	return { ended };
}

/** How many sessions an account has that are still live (the audit's "before"). */
export async function countLiveSessionsForAdmin(userId: string): Promise<number> {
	return Number(await db.sessions.where({ userId }).count());
}
