import { db } from "@backend/db/db";
import { createRateLimitMiddleware } from "@backend/middlewares/rate_limit.middleware";
import {
	type RpcActiveTeamContext,
	type RpcAuthenticatedContext,
	rpcProtectedActiveTeamProcedure,
	rpcProtectedProcedure,
	rpcTeamOwnerAdminProcedure,
} from "@backend/procedures/protected.procedure";
import {
	type RpcContextWithHeaders,
	rpcPublicProcedure,
} from "@backend/procedures/public.procedure";
import { assertOwnCdnUrl } from "@backend/utils/cdn_url.utils";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import {
	teamAppCreateApiInputZod,
	teamAppMemberAddInputZod,
	teamAppMemberRoleZod,
	teamAppMemberSelectAllZod,
	teamAppSelectAllZod,
	teamAppUpdateApiInputZod,
	teamBrandingLookupInputZod,
	teamBrandingPublicZod,
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
import { queueTeamInvitation } from "./notifications/team_invitation.notifications.teams";
import { getTeamBrandingBySlugService } from "./services/branding.teams.service";
import { createTeamService } from "./services/create_team.teams.service";
import { pullTeamMembersService, pullTeamsAppService } from "./services/sync.teams.service";
import { assertNotLastOwner, personalOwnerOf } from "./services/team_roles.teams.service";

const getMyTeams = rpcProtectedProcedure
	.route({ method: "GET", tags: ["Teams"] })
	.output(z.array(teamWithRoleZod))
	.handler(async ({ context: { user } }) => {
		const userId = user.id;

		// 1. Claim invitations sent to an identifier this account has proved.
		//    Not a team request: the tenant scope is lifted on purpose.
		if (user.email && user.emailVerified) {
			await db.teamMembers
				.unscope("default")
				.where({ email: user.email, userId: null })
				.update({ userId, joinedAt: Date.now() });
		}
		if (user.phoneNumber && user.phoneNumberVerified) {
			await db.teamMembers
				.unscope("default")
				.where({ phoneNumber: user.phoneNumber, userId: null })
				.update({ userId, joinedAt: Date.now() });
		}

		// 2. Every live team the caller belongs to, with their role. The
		//    `team` relation keeps the soft-delete filter, so a deleted team
		//    drops out.
		const memberships = await db.teamMembers
			.unscope("default")
			.where({ userId })
			.select("joinedAt", "role", { team: (q) => q.team.selectAll() });

		return memberships.flatMap((m) =>
			m.team ? [{ ...m.team, joinedAt: m.joinedAt, userRole: m.role }] : [],
		);
	});

const createTeam = rpcProtectedProcedure
	.route({ method: "POST", tags: ["Teams"] })
	// Teams are free; a script must not mint thousands (each is a workspace,
	// and an invitation sender).
	.use(
		createRateLimitMiddleware<RpcAuthenticatedContext>({
			bucketFn: (ctx) => ({
				key: `create-team:user:${ctx.user.id}`,
				limit: 10,
				windowSeconds: 3600,
			}),
			label: "create-team",
		}),
	)
	.input(teamAppCreateApiInputZod)
	.output(teamAppSelectAllZod)
	.handler(async ({ input, context: { user } }) => {
		assertOwnCdnUrl(input.logoUrl, "logoUrl");
		const userId = user.id;

		// `createTeamService` forces `createdByUserId = userId` and
		// `personalTeamForUserId = null` for client-driven creates. Personal-team
		// provisioning is exclusively a server-only path (`getDefaultTeam` /
		// `UserTable.afterCreate`).
		return await createTeamService(userId, user.email, user.phoneNumber, input);
	});

// Owner/Admin edit of the active team's identity + white-label branding.
// `slug` is not accepted (zod strips it): the operator assigns it from the
// super-admin console (`assignTeamSlug`).
const updateTeam = rpcTeamOwnerAdminProcedure
	.route({ method: "PUT", tags: ["Teams"] })
	.input(teamAppUpdateApiInputZod)
	.output(teamAppSelectAllZod)
	.handler(async ({ input, context: { activeTeamId } }) => {
		// Pictures shown to every member and to every visitor of the team's
		// login page must come from the app's own storage, never a host the
		// editor controls (it would log every visitor and could swap the icon).
		assertOwnCdnUrl(input.logoUrl, "logoUrl");
		assertOwnCdnUrl(input.pwaIconUrl, "pwaIconUrl");
		return await db.teamsApp.find(activeTeamId).selectAll().update(input);
	});

// Public (pre-login) branding lookup for `<slug>.<root>` hosts. Only ever
// returns the white-label projection, never members or ownership.
// IP-bucketed because it is unauthenticated.
const getBrandingBySlug = rpcPublicProcedure
	.use(
		createRateLimitMiddleware<RpcContextWithHeaders>({
			bucketFn: (ctx) => ({
				key: `branding:ip:${getClientIpAddress(ctx.reqHeaders)}`,
				limit: 60,
				windowSeconds: 60,
			}),
			label: "branding",
		}),
	)
	.route({ method: "GET", tags: ["Teams"] })
	.input(teamBrandingLookupInputZod)
	.output(teamBrandingPublicZod.nullable())
	.handler(async ({ input: { slug } }) => {
		return await getTeamBrandingBySlugService(slug);
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
	// Caps a runaway or abusive inviter (and, from the invitation e-mail on,
	// what the app's sender can be made to send). Fails open with Redis down,
	// like every limit that does not guard a guessable secret.
	.use(
		createRateLimitMiddleware<RpcActiveTeamContext>({
			bucketFn: (ctx) => ({
				key: `invite:user:${ctx.user.id}`,
				limit: 30,
				windowSeconds: 3600,
			}),
			label: "invite",
		}),
	)
	.input(teamAppMemberAddInputZod)
	.output(teamAppMemberSelectAllZod)
	.handler(async ({ input, context: { activeTeamId, user } }) => {
		const { email, phoneNumber } = input;
		const ownEmail = user.email?.trim().toLowerCase();
		if (
			(email && ownEmail && email.trim().toLowerCase() === ownEmail) ||
			(phoneNumber && user.phoneNumber && phoneNumber === user.phoneNumber)
		) {
			throw new ORPCError("CONFLICT", { status: 409, message: "You are already in this team." });
		}
		// Always a pending invitation. Looking the address up and joining an
		// existing account at once told every caller whether that address has
		// an account here, so whether an account exists must not show in the
		// response, in getTeamMembers or in the email. The invitee joins on
		// their next `getMyTeams` (verified identifiers only).
		const member = await db.teamMembers.create({
			...input,
			teamId: activeTeamId,
			userId: null,
			joinedAt: null,
		});
		// Tell them by email (phone-only adds get nothing: no SMS provider).
		// Awaited but never throws; the row above is already written.
		if (email) {
			await queueTeamInvitation({
				teamId: activeTeamId,
				email,
				role: input.role,
				inviterName: user.name,
			});
		}
		return member;
	});

const removeTeamMember = rpcTeamOwnerAdminProcedure
	.route({ method: "DELETE", tags: ["Teams"] })
	.input(z.object({ id: z.ulid() }))
	.output(z.object({ success: z.boolean() }))
	.handler(
		async ({
			input: { id },
			context: { activeTeamId, activeTeamMemberId, activeTeamMemberRole },
		}) => {
			// The tenant scope keeps the lookup inside the active team. Refusals
			// are typed: a plain Error reached the client as a 500.
			const target = await db.teamMembers.where({ id }).takeOptional();
			if (!target) {
				throw new ORPCError("NOT_FOUND", { status: 404, message: "Member not found." });
			}
			if (target.id === activeTeamMemberId) {
				throw new ORPCError("BAD_REQUEST", {
					status: 400,
					message: "To leave this team, use Leave team.",
				});
			}
			if (activeTeamMemberRole === "Admin" && target.role !== "Member") {
				throw new ORPCError("FORBIDDEN", {
					status: 403,
					message: "Only an Owner can remove an Owner or an Admin.",
				});
			}
			const personalOwner = await personalOwnerOf(activeTeamId);
			if (personalOwner !== null && target.userId === personalOwner) {
				throw new ORPCError("FORBIDDEN", {
					status: 403,
					message: "The account a personal team belongs to cannot be removed from it.",
				});
			}
			await assertNotLastOwner(activeTeamId, target.id);
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
	.handler(async ({ input, context: { activeTeamId, activeTeamMemberRole } }) => {
		if (activeTeamMemberRole !== "Owner") {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "Only Owners can change roles",
			});
		}
		const { id, role } = input;
		const target = await db.teamMembers.where({ id }).takeOptional();
		if (!target) {
			throw new ORPCError("NOT_FOUND", { status: 404, message: "Member not found." });
		}
		const personalOwner = await personalOwnerOf(activeTeamId);
		if (personalOwner !== null && target.userId === personalOwner) {
			throw new ORPCError("FORBIDDEN", {
				status: 403,
				message: "The account a personal team belongs to stays its Owner.",
			});
		}
		if (role !== "Owner") await assertNotLastOwner(activeTeamId, target.id);

		return await db.teamMembers.where({ id }).selectAll().take().update({ role });
	});

// Session-only membership reconciliation. Returns the ids of every team the
// caller is CURRENTLY an active member of. Deliberately NOT active-team-scoped
// (`rpcProtectedProcedure`, not `rpcProtectedActiveTeamProcedure`): the client
// calls this at the start of every sync cycle to learn which locally-mirrored
// teams it no longer belongs to and must wipe. If it required the active team,
// a user removed from their active team would get 403 here too — the exact
// dead-end this fixes (see the sync orchestrator's reconcileMemberships).
//
// The tenant default scope is lifted (it refuses a query without a team
// request context), so this returns memberships across ALL teams; the
// soft-delete filter still applies, so only active (non-revoked) memberships
// come back.
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
		if (!team) throw new ORPCError("NOT_FOUND", { status: 404, message: "Team not found." });
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
			const team = await db.teamsApp.where({ id: user.activeTeamAppId }).takeOptional();
			if (team) return team;
		}

		// 2. No default team set, or it was deleted. Check for an existing personal team.
		let personalTeam = await db.teamsApp.where({ personalTeamForUserId: userId }).takeOptional();

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
		await db.users.where({ id: userId }).update({ activeTeamAppId: personalTeam.id });

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
	updateTeam,
	getBrandingBySlug,
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
