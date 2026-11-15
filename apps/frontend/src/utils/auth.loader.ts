import { userContext } from "@frontend/contexts/UserContext";
import { setSentryUser } from "@frontend/instrumentation";
import { setActiveTeamIdForRequests } from "@frontend/utils/active_team_header.client";
import { authClient } from "@frontend/utils/auth.client";
import { getAuthCache, saveAuthCache, saveLastLogin } from "@frontend/utils/auth.persistence";
import { mirrorToLocalDb } from "@frontend/utils/mirror_to_local_db";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { consumeFreshSessionRequest } from "@frontend/utils/session_refresh.client";
import { detectUserTimezone } from "@frontend/utils/timezone.utils";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { toast } from "react-toastify";

/**
 * Auth loader for protected routes
 * Fetches session, sets React Router context, and redirects based on auth state
 */
export async function authLoader({ context }: LoaderFunctionArgs) {
	const cached = getAuthCache();
	const isOffline = !navigator.onLine;

	// 0. If offline and we have a cache, skip the network call entirely
	if (isOffline && cached) {
		const sessionInfo = {
			hasSession: true,
			user: cached.user,
			isRegistered: true,
		};
		// Seed the header cache before any component mounts — otherwise
		// team-scoped queries can fire before WorkspaceContext's effect runs.
		setActiveTeamIdForRequests(cached.user.activeTeamAppId ?? null);
		context.set(userContext, sessionInfo);
		return sessionInfo;
	}

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

			if (cached && (isOffline || isNetworkError)) {
				const sessionInfo = {
					hasSession: true,
					user: cached.user,
					isRegistered: true,
				};

				setActiveTeamIdForRequests(cached.user.activeTeamAppId ?? null);
				context.set(userContext, sessionInfo);
				return sessionInfo;
			}

			throw redirect("/auth");
		}

		// Save successful session to cache for offline use
		saveAuthCache(session.user);
		// Save basic info for login page remembered state
		saveLastLogin({
			name: session.user.name,
			email: session.user.email,
			image: session.user.image,
		});

		// Timezone Detection and Auto-Update
		try {
			const detectedTimezone = await detectUserTimezone();
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

				// Re-cache with updated timezone
				saveAuthCache(session.user);
			}
		} catch (timezoneError) {
			console.error(timezoneError);
			toast.error("Timezone detection/update failed.");
		}

		// Seed the `x-team-id` header cache BEFORE any component mounts.
		// The RPC link's headers callback is synchronous — if this isn't
		// set by the time the first team-scoped query fires, the backend
		// rejects with 403 "Active team id mismatch".
		setActiveTeamIdForRequests(session.user.activeTeamAppId ?? null);

		// Self-heal for stale better-auth cookieCache (`auth.config.ts`
		// `session.cookieCache.maxAge = 5min`). When the cookie was signed
		// before `users.activeTeamAppId` was set on the row, `getSession()`
		// keeps returning `null` for up to 5 minutes. `getDefaultTeam` is
		// the server's canonical fallback: returns the existing personal
		// team, or creates one, and stamps it back onto the user row.
		// Uses `rpcProtectedProcedure` (no `x-team-id` required), so calling
		// it with the header cache seeded to `null` is safe.
		if (!session.user.activeTeamAppId) {
			try {
				const defaultTeam = await orpcFetch.teams.getDefaultTeam();
				session.user.activeTeamAppId = defaultTeam.id;
				setActiveTeamIdForRequests(defaultTeam.id);
				saveAuthCache(session.user);
				// Fire-and-forget: `initSyncForUser` hasn't opened Dexie
				// yet; `mirrorToLocalDb` awaits `sync.waitForReady()`
				// internally, so this queues until the DB is open.
				void mirrorToLocalDb({ table: "teamsApp", rows: [defaultTeam] });
			} catch (err) {
				console.warn("[authLoader] getDefaultTeam fallback failed", err);
			}
		}

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

		// Return session data for loader
		return sessionInfo;
	} catch (error) {
		if (error instanceof Response) throw error; // Re-throw redirects

		console.error("Auth loader error:", error);

		// Final fallback for unexpected errors (like TypeError: Failed to fetch)
		// We trigger this even if navigator.onLine is true because the server is clearly unreachable
		if (cached) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isFetchError =
				errorMessage.toLowerCase().includes("fetch") ||
				errorMessage.toLowerCase().includes("network");

			if (isOffline || isFetchError) {
				const sessionInfo = {
					hasSession: true,
					user: cached.user,
					isRegistered: true,
				};
				setActiveTeamIdForRequests(cached.user.activeTeamAppId ?? null);
				context.set(userContext, sessionInfo);
				return sessionInfo;
			}
		}

		throw redirect("/auth");
	}
}
