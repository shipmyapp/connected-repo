import { userContext } from "@frontend/contexts/UserContext";
import { setSentryUser } from "@frontend/instrumentation";
import {
	authorizeUrl,
	rememberOAuth,
	takePendingOAuth,
} from "@frontend/modules/auth/lib/pending-oauth";
import { offlineTenantDecision } from "@frontend/tenant/tenant.lock";
import {
	getTenantSlug,
	loadTenantBranding,
	readCachedBranding,
} from "@frontend/tenant/tenant.resolver";
import { setActiveTeamIdForRequests } from "@frontend/utils/active_team_header.client";
import { authBaseUrl, authClient } from "@frontend/utils/auth.client";
import type { CachedSession } from "@frontend/utils/auth.persistence";
import { getAuthCache, saveAuthCache, saveLastLogin } from "@frontend/utils/auth.persistence";
import { mirrorToLocalDb } from "@frontend/utils/mirror_to_local_db";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { consumeFreshSessionRequest } from "@frontend/utils/session_refresh.client";
import { detectUserTimezone } from "@frontend/utils/timezone.utils";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, redirectDocument } from "react-router";
import { toast } from "react-toastify";

/**
 * Offline / server-unreachable: boot the cached session. On a team host the
 * cached session must be locked to the host's team (tenant.lock.ts),
 * otherwise refuse. Sign-out cannot reach the server offline; the login
 * page asks again once online.
 */
function sessionFromCache(cached: CachedSession, context: LoaderFunctionArgs["context"]) {
	const slug = getTenantSlug();
	const decision = offlineTenantDecision({
		slug,
		cachedBranding: slug ? readCachedBranding(slug) : null,
		cachedActiveTeamId: cached.user.activeTeamAppId,
	});
	if (!decision.ok) throw redirect("/auth/login");
	const sessionInfo = {
		hasSession: true,
		user: cached.user,
		isRegistered: true,
	};
	// Seed the header cache before any component mounts. Otherwise
	// team-scoped queries can fire before WorkspaceContext's effect runs.
	setActiveTeamIdForRequests(cached.user.activeTeamAppId ?? null);
	context.set(userContext, sessionInfo);
	return sessionInfo;
}

/**
 * Team host (`<slug>.<root>`): the app is locked to one team.
 *   1. The signed-in user must be a member, otherwise `/auth/no-access`.
 *   2. Returns the team id; the caller makes it the session's active team
 *      CLIENT-SIDE ONLY. Nothing calls `teams.setActiveTeam`: the backend
 *      authorises this host's requests by the host's team
 *      (protected.procedure.ts `tenantTeamIdForRequest`), so the user's other
 *      clients on the shared app keep their team (ADR-039).
 * Shared app: returns null.
 * Every call here is `noTeam`: the header cache is not seeded yet.
 */
async function enforceTenantTeam(): Promise<string | null> {
	if (!getTenantSlug()) return null;
	const branding = await loadTenantBranding();
	// Unknown or withdrawn subdomain: never continue unlocked. TenantGate
	// shows "Workspace not found" once TenantProvider's own load settles.
	if (!branding) throw new Response("Unknown workspace", { status: 404 });
	const { teamIds } = await orpcFetch.teams.listMyActiveTeamIds(undefined, {
		context: { noTeam: true },
	});
	if (!teamIds.includes(branding.teamId)) throw redirect("/auth/no-access");
	return branding.teamId;
}

/**
 * Auth loader for protected routes.
 * Fetches the session, locks a team host to its team, seeds the `x-team-id`
 * header cache once, and falls back to the cached session offline.
 */
export async function authLoader({ context }: LoaderFunctionArgs) {
	const cached = getAuthCache();
	const isOffline = !navigator.onLine;

	// 0. If offline and we have a cache, skip the network call entirely
	if (isOffline && cached) return sessionFromCache(cached, context);

	try {
		// A team switch (or anything else that writes the `users` row outside
		// better-auth) asks for one uncached read here. Without it the 5-minute
		// `session.cookieCache` keeps serving the pre-switch `activeTeamAppId`
		// and the revalidation that follows the switch silently undoes it.
		// Consumed only on this online path: the offline branch above never
		// reaches the network, so the request waits for the next online run.
		const disableCookieCache = consumeFreshSessionRequest();
		const { data: session, error } = await authClient.getSession(
			disableCookieCache ? { query: { disableCookieCache: true } } : undefined,
		);

		if (error || !session) {
			// If we have a cached session and it seems like a network error or we are known to be offline
			// Note: error.status might be undefined for network errors in better-auth
			const isNetworkError = error && (!error.status || error.status >= 500);
			if (cached && (isOffline || isNetworkError)) return sessionFromCache(cached, context);
			throw redirect("/auth");
		}

		// Save basic info for login page remembered state
		saveLastLogin({
			name: session.user.name,
			email: session.user.email,
			image: session.user.image,
		});

		// A sign-in that started from an AI app's authorize request carries on
		// there (ADR-045). A document redirect: the authorize endpoint is on the
		// app's own origin, and the router would render it as a page of the app.
		const pendingOAuth = takePendingOAuth();
		if (pendingOAuth) {
			throw redirectDocument(authorizeUrl(authBaseUrl ?? window.location.origin, pendingOAuth));
		}

		// Timezone Detection and Auto-Update
		try {
			const detectedTimezone = detectUserTimezone();
			if (detectedTimezone && detectedTimezone !== session.user.timezone) {
				toast.info(`Timezone change detected. Updating timezone to match your current location.`, {
					position: "top-center",
					autoClose: 1000,
				});

				await authClient.updateUser({ timezone: detectedTimezone });

				// Update the session user object with the new timezone
				session.user.timezone = detectedTimezone;

				// Show toast notification
				toast.success(`Your timezone has been updated to match your current location`, {
					position: "top-center",
					autoClose: 3000,
				});
			}
		} catch (timezoneError) {
			console.error(timezoneError);
			toast.error("Timezone detection/update failed.");
		}

		// Self-heal for stale better-auth cookieCache (`auth.config.ts`
		// `session.cookieCache.maxAge = 5min`). When the cookie was signed
		// before `users.activeTeamAppId` was set on the row, `getSession()`
		// keeps returning `null` for up to 5 minutes. `getDefaultTeam` is
		// the server's canonical fallback: returns the existing personal
		// team, or creates one, and stamps it back onto the user row. It is
		// session-only, so it goes out before the header cache is seeded
		// (`noTeam`).
		if (!session.user.activeTeamAppId) {
			try {
				const defaultTeam = await orpcFetch.teams.getDefaultTeam(undefined, {
					context: { noTeam: true },
				});
				session.user.activeTeamAppId = defaultTeam.id;
				// Fire-and-forget: `initSyncForUser` hasn't opened Dexie
				// yet; `mirrorToLocalDb` awaits `sync.waitForReady()`
				// internally, so this queues until the DB is open.
				void mirrorToLocalDb({ table: "teamsApp", rows: [defaultTeam] });
			} catch (err) {
				console.warn("[authLoader] getDefaultTeam fallback failed", err);
			}
		}

		// Team host: lock to the host's team BEFORE the header cache is seeded,
		// so no request can go out with the server's active team first.
		const tenantTeamId = await enforceTenantTeam();
		if (tenantTeamId) session.user.activeTeamAppId = tenantTeamId;

		// Offline fallback copy, already locked (tenant.lock.ts relies on it).
		saveAuthCache(session.user);

		// Seed the `x-team-id` header cache BEFORE any component mounts. The
		// WorkspaceProvider effect then runs initSyncForUser(userId, this id),
		// which seeds the worker cache and kicks local sync with the same id.
		setActiveTeamIdForRequests(session.user.activeTeamAppId ?? null);

		const sessionInfo = {
			hasSession: true,
			user: session.user,
			isRegistered: true, // better-auth handles registration
		};

		// The id only: Sentry finds the person from it, and no email or name
		// travels with every event.
		void setSentryUser({ id: session.user.id });

		// Set user context in React Router context
		context.set(userContext, sessionInfo);

		return sessionInfo;
	} catch (error) {
		if (error instanceof Response) throw error; // Re-throw redirects and the 404

		console.error("Auth loader error:", error);

		// Final fallback for unexpected errors (like TypeError: Failed to fetch)
		// We trigger this even if navigator.onLine is true because the server is clearly unreachable
		if (cached) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isFetchError =
				errorMessage.toLowerCase().includes("fetch") ||
				errorMessage.toLowerCase().includes("network");
			if (isOffline || isFetchError) return sessionFromCache(cached, context);
		}

		throw redirect("/auth");
	}
}

/**
 * Loader for `/oauth/consent` (ADR-045). Online only: the consent must reach
 * the server. A person whose session ended between the app's request and
 * this screen goes back to sign in with the request kept. The `x-team-id`
 * header cache is seeded so the page's oRPC call does not wait for
 * `AppLayout`.
 */
export async function oauthConsentLoader({ request }: LoaderFunctionArgs) {
	const params = new URL(request.url).searchParams;
	// The request is answered here; nothing left to resume.
	takePendingOAuth();
	const { data: session } = await authClient.getSession().catch(() => ({ data: null }));
	if (!session) {
		rememberOAuth(params);
		throw redirect("/auth/login");
	}
	setActiveTeamIdForRequests(session.user.activeTeamAppId ?? null);
	return null;
}
