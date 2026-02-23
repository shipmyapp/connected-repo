import { userContext } from "@frontend/contexts/UserContext";
import { setSentryUser } from "@frontend/instrumentation";
import { authClient } from "@frontend/utils/auth.client";
import { getAuthCache, saveAuthCache, saveLastLogin } from "@frontend/utils/auth.persistence";
import { detectUserTimezone } from "@frontend/utils/timezone.utils";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * Auth loader for protected routes
 * Fetches session, sets React Router context, and redirects based on auth state
 */
export async function authLoader({ context }: LoaderFunctionArgs) {
	const cached = getAuthCache();
	const isOffline = !navigator.onLine;

	// 0. If offline and we have a cache, skip the network call entirely
	if (isOffline && cached) {
		console.info("[AuthLoader] Offline: skipping getSession, using cache.");
		const sessionInfo = {
			hasSession: true,
			user: cached.user,
			isRegistered: true,
		};
		context.set(userContext, sessionInfo);
		return sessionInfo;
	}

	try {
		// Fetch session from better-auth client
		const { data: session, error } = await authClient.getSession();

		if (error || !session) {
			// If we have a cached session and it seems like a network error or we are known to be offline
			// Note: error.status might be undefined for network errors in better-auth
			const isNetworkError = error && (!error.status || error.status >= 500);

			if (cached && (isOffline || isNetworkError)) {
				console.info(`[AuthLoader] Using cached session (${isOffline ? 'offline' : 'server unreachable'})`);
				
				const sessionInfo = {
					hasSession: true,
					user: cached.user,
					isRegistered: true,
				};

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
				const { toast } = await import("react-toastify");
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
			const { toast } = await import("react-toastify");
			toast.error("Timezone detection/update failed.");
		}

		const sessionInfo = {
			hasSession: true,
			user: session.user,
			isRegistered: true, // better-auth handles registration
		};

		setSentryUser({
			email: session.user.email,
			username: session.user.name,
			id: session.user.id
		})

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
			const isFetchError = errorMessage.toLowerCase().includes("fetch") || errorMessage.toLowerCase().includes("network");

			if (isOffline || isFetchError) {
				console.info("[AuthLoader] Fallback to cache due to fetch error");
				const sessionInfo = {
					hasSession: true,
					user: cached.user,
					isRegistered: true,
				};
				context.set(userContext, sessionInfo);
				return sessionInfo;
			}
		}

		throw redirect("/auth");
	}
}
