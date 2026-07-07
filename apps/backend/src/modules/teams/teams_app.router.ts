import { db } from "@backend/db/db";
import {
	rpcProtectedActiveTeamProcedure,
	rpcProtectedProcedure,
	rpcTeamOwnerAdminProcedure,
} from "@backend/procedures/protected.procedure";
import {
	teamAppCreateApiInputZod,
	teamAppMemberAddInputZod,
	teamAppMemberRoleZod,
	teamAppMemberSelectAllZod,
	teamAppSelectAllZod,
	teamWithRoleZod,
} from "@connected-repo/zod-schemas/team_app.zod";
import {
	teamMembersPullBundlesInputZod,
	teamMembersPullBundlesOutputZod,
	teamsAppPullBundlesInputZod,
	teamsAppPullBundlesOutputZod,
} from "@connected-repo/zod-schemas/teams/sync";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { createTeamService } from "./services/create_team.teams.service";
import {
	pullTeamMembersService,
	pullTeamsAppService,
} from "./services/sync.teams.service";

const getMyTeams = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Teams"] })
	.output(z.array(teamWithRoleZod))
	.handler(async ({ context: { user } }) => {
		const userId = user.id;
		const userEmail = user.email;

		// 1. Claim any memberships added by email but without userId
		if (userEmail) {
			await db.teamMembers.where({ email: userEmail, userId: null }).update({
				userId,
				joinedAt: Date.now(),
			});
		}

		// 2. Claim any memberships added by phoneNumber but without userId
		if (user.phoneNumber) {
			await db.teamMembers
				.where({ phoneNumber: user.phoneNumber, userId: null })
				.update({
					userId,
					joinedAt: Date.now(),
				});
		}

		// 3. Join teams with team_members to get user role
		const teamsWithRoles = await db.teamsApp
			.join("members")
			.where({ "members.userId": userId })
			.select("*", "members.joinedAt", "members.role");

		return teamsWithRoles.map((t) => ({
			...t,
			joinedAt: t.joinedAt,
			userRole: t.role,
		}));
	});

const createTeam = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Teams"] })
	.input(teamAppCreateApiInputZod)
	.output(teamAppSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		const userId = user.id;

		// `createTeamService` forces `createdByUserId = userId` and
		// `personalTeamForUserId = null` for client-driven creates. Personal-team
		// provisioning is exclusively a server-only path (`getDefaultTeam` /
		// `UserTable.afterCreate`).
		return await createTeamService(userId, user.email, user.phoneNumber, input);
	});

// Team-scoped reads/mutations use `rpcProtectedActiveTeamProcedure`, which
// enforces `x-team-id === user.activeTeamAppId` and populates ALS with
// `tenantTeamId`. `team_members`'s default scope filters on that tenant, so
// handlers don't need explicit `where({ teamId })`.

const getTeamMembers = rpcProtectedActiveTeamProcedure
	.route({ method: "GET", tags: ["Teams"] })
	.output(z.array(teamAppMemberSelectAllZod))
	.handler(async () => {
		return await db.teamMembers;
	});

const addTeamMember = rpcTeamOwnerAdminProcedure
	.route({ method: "POST", tags: ["Teams"] })
	.input(teamAppMemberAddInputZod)
	.output(teamAppMemberSelectAllZod)
	.handler(async ({ input, context: { activeTeamId } }) => {
		const { email, phoneNumber } = input;

		// Try to find if user already exists on platform
		let targetUser = null;
		if (email) {
			targetUser = await db.users.where({ email }).takeOptional();
		} else if (phoneNumber) {
			targetUser = await db.users.where({ phoneNumber }).takeOptional();
		}

		return await db.teamMembers.create({
			...input,
			teamId: activeTeamId,
			userId: targetUser?.id || null,
			joinedAt: targetUser ? Date.now() : null,
		});
	});

const removeTeamMember = rpcTeamOwnerAdminProcedure
	.route({ method: "DELETE", tags: ["Teams"] })
	.input(z.object({ id: z.ulid() }))
	.output(z.object({ success: z.boolean() }))
	.handler(
		async ({ input: { id }, context: { activeTeamMemberRole } }) => {
			// Default scope on team_members restricts to the active team, so
			// looking up by id will 404 for members of other teams.
			const target = await db.teamMembers.where({ id }).takeOptional();
			if (!target) throw new Error("Member not found");

			// Owners cannot be removed by Admins
			if (target.role === "Owner" && activeTeamMemberRole === "Admin") {
				throw new Error("Unauthorized: Admins cannot remove the Owner");
			}

			await db.teamMembers.where({ id }).delete();
			return { success: true };
		},
	);

const updateMemberRole = rpcProtectedActiveTeamProcedure
	.route({ method: "PUT", tags: ["Teams"] })
	.input(
		z.object({
			id: z.ulid(),
			role: teamAppMemberRoleZod,
		}),
	)
	.output(teamAppMemberSelectAllZod)
	.handler(async ({ input, context: { activeTeamMemberRole } }) => {
		if (activeTeamMemberRole !== "Owner") {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Only Owners can change roles",
			});
		}
		const { id, role } = input;
		const target = await db.teamMembers.where({ id }).takeOptional();
		if (!target) throw new Error("Member not found");

		return await db.teamMembers
			.where({ id })
			.selectAll()
			.take()
			.update({ role });
	});

// Session-only membership reconciliation. Returns the ids of every team the
// caller is CURRENTLY an active member of. Deliberately NOT active-team-scoped
// (`rpcProtectedProcedure`, not `rpcProtectedActiveTeamProcedure`): the client
// calls this at the start of every sync cycle to learn which locally-mirrored
// teams it no longer belongs to and must wipe. If it required the active team,
// a user removed from their active team would get 403 here too — the exact
// dead-end this fixes (see the sync orchestrator's reconcileMemberships).
//
// `team_members`'s tenant default scope is a no-op without request context, so
// this returns memberships across ALL teams; the soft-delete filter still
// applies, so only active (non-revoked) memberships come back.
const listMyActiveTeamIds = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Teams"] })
	.output(z.object({ teamIds: z.array(z.ulid()) }))
	.handler(async ({ context: { user } }) => {
		const rows = await db.teamMembers
			.unscope("default")
			.where({ userId: user.id })
			.select("teamId");
		return { teamIds: rows.map((r) => r.teamId) };
	});

// Persists the caller's active team on the user record. Uses plain
// `rpcProtectedProcedure` — if the user is stuck on a stale/removed team,
// requiring x-team-id to match `activeTeamAppId` here would prevent them from
// switching away. Membership is validated against the *target* team.
const setActiveTeam = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Teams"] })
	.input(z.object({ teamAppId: z.ulid() }))
	.output(z.object({ activeTeamAppId: z.string() }))
	.handler(async ({ input: { teamAppId }, context: { user } }) => {
		const membership = await db.teamMembers
			.unscope("default")
			.where({ teamId: teamAppId, userId: user.id })
			.takeOptional();
		if (!membership) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Not a member of this team.",
			});
		}
		await db.users.where({ id: user.id }).update({ activeTeamAppId: teamAppId });
		return { activeTeamAppId: teamAppId };
	});

// Guarded delete. Personal teams (personalTeamForUserId !== null) are
// non-deletable by contract — every user must always have exactly one.
// Only the Owner of the active team can delete it; the middleware also
// enforces that the client is *on* that team (`x-team-id` header).
const deleteTeam = rpcTeamOwnerAdminProcedure
	.route({ method: "DELETE", tags: ["Teams"] })
	.output(z.object({ success: z.boolean() }))
	.handler(async ({ context: { activeTeamId, activeTeamMemberRole } }) => {
		if (activeTeamMemberRole !== "Owner") {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Only the Owner can delete a team.",
			});
		}
		const team = await db.teamsApp.where({ id: activeTeamId }).takeOptional();
		if (!team) throw new Error("Team not found");
		if (team.personalTeamForUserId !== null) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Personal teams cannot be deleted.",
			});
		}
		await db.teamsApp.where({ id: activeTeamId }).delete();
		return { success: true };
	});

const getDefaultTeam = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Teams"] })
	.output(teamAppSelectAllZod)
	.handler(async ({ context: { user } }) => {
		const userId = user.id;

		// 1. If user already has an active team, return it
		if (user.activeTeamAppId) {
			const team = await db.teamsApp
				.where({ id: user.activeTeamAppId })
				.takeOptional();
			if (team) return team;
		}

		// 2. No default team set, or it was deleted. Check for an existing personal team.
		let personalTeam = await db.teamsApp
			.where({ personalTeamForUserId: userId })
			.takeOptional();

		if (!personalTeam) {
			// 3. Create a new personal team
			const firstName = user.name.split(" ")[0] || "Personal";
			const teamName = `${firstName}'s Team`;

			personalTeam = await createTeamService(
				userId,
				user.email,
				user.phoneNumber,
				{ name: teamName },
				{ personalTeamForUserId: userId },
			);
		}

		// 4. Update user's active team
		await db.users
			.where({ id: userId })
			.update({ activeTeamAppId: personalTeam.id });

		return personalTeam;
	});

// ─── Sync — wave-1 anchor ────────────────────────────────────────────────
//
// `pullBundles` mints `topLevelSyncedAt` and returns it so downstream
// per-table pulls in the same cycle can echo it back as the snapshot
// ceiling. Scoped to the caller's team memberships (returns ALL teams the
// user belongs to, not just the active one — the client renders its team
// picker from this).
//
// Uses `rpcProtectedActiveTeamProcedure` because `pullTeamsAppService` →
// `syncDeltaService` reads `tenantTeamId` from AsyncLocalStorage, which
// only that procedure populates. The active-team requirement is safe here
// because every user always has an `activeTeamAppId` (personal team
// created on signup, non-deletable).
const pullBundles = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Teams"] })
	.input(teamsAppPullBundlesInputZod)
	.output(teamsAppPullBundlesOutputZod)
	.handler(async ({ input, context: { user } }) => {
		return await pullTeamsAppService(input, user.id);
	});

const pullMembersDelta = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Teams"] })
	.input(teamMembersPullBundlesInputZod)
	.output(teamMembersPullBundlesOutputZod)
	.handler(async ({ input }) => {
		return await pullTeamMembersService(input);
	});

export const teamsAppRouter = {
	getMyTeams,
	listMyActiveTeamIds,
	createTeam,
	setActiveTeam,
	deleteTeam,
	getTeamMembers,
	addTeamMember,
	removeTeamMember,
	updateMemberRole,
	getDefaultTeam,
	pullBundles,
	pullMembersDelta,
};
