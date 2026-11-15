import { db } from "@backend/db/db";
import type {
	SuperAdminListInput,
	SuperAdminTeamDetail,
	SuperAdminTeamListOutput,
} from "@connected-repo/zod-schemas/super_admin.zod";
import { ORPCError } from "@orpc/server";

/**
 * The super-admin's view of teams. Cross-tenant on purpose: super-admin
 * procedures run with no request context, and `team_members` is read
 * through `.unscope("default")` to say so.
 */
export async function listTeamsForAdmin(
	input: SuperAdminListInput,
): Promise<SuperAdminTeamListOutput> {
	const search = input.search?.trim();
	// The filter is shared; the ORDER BY is not. `count()` on an ordered
	// query emits `SELECT count(*) … ORDER BY created_at`, which Postgres
	// rejects (the column is neither grouped nor aggregated).
	let filtered = db.teamsApp;
	if (search) {
		filtered = filtered.where({ name: { contains: search } });
	}
	const [rows, total] = await Promise.all([
		// `id` breaks ties: ULIDs grow with time, and rows created in one
		// transaction share `created_at`.
		filtered.order({ createdAt: "DESC", id: "DESC" }).limit(input.limit).offset(input.offset),
		filtered.count(),
	]);
	const teamIds = rows.map((t) => t.id);
	const [owners, counts] = await Promise.all([
		teamIds.length
			? db.teamMembers
					.unscope("default")
					.where({ teamId: { in: teamIds }, role: "Owner" })
					.select("teamId", "email")
			: Promise.resolve([]),
		teamIds.length
			? db.teamMembers
					.unscope("default")
					.where({ teamId: { in: teamIds } })
					.select("teamId", { n: (q) => q.count() })
					.group("teamId")
			: Promise.resolve([]),
	]);
	const ownerByTeam = new Map(owners.map((o) => [o.teamId, o.email]));
	const countByTeam = new Map(counts.map((c) => [c.teamId, Number(c.n)]));
	return {
		rows: rows.map((t) => ({
			...t,
			ownerEmail: ownerByTeam.get(t.id) ?? null,
			memberCount: countByTeam.get(t.id) ?? 0,
		})),
		total: Number(total),
	};
}

/** One team with its members; NOT_FOUND when there is no live team by that id. */
export async function getTeamForAdmin(teamId: string): Promise<SuperAdminTeamDetail> {
	const team = await db.teamsApp.where({ id: teamId }).takeOptional();
	if (!team) {
		throw new ORPCError("NOT_FOUND", { status: 404, message: "Team not found" });
	}
	const members = await db.teamMembers
		.unscope("default")
		.where({ teamId })
		.select("id", "role", "email", "phoneNumber", "userId", "addedAt", "joinedAt", {
			// A member added by email who has not signed up yet has no user
			// row; a strict `get` here would throw "Record is not found" and
			// the whole team page would answer 404.
			userName: (q) => q.user.getOptional("name"),
		})
		.order({ addedAt: "ASC" });
	return {
		team,
		members: members.map((m) => ({ ...m, userName: m.userName ?? null })),
	};
}
