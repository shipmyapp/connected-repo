import { userContext } from "@frontend/contexts/UserContext";
import { authClient, authClientGetSession, SESSION_CACHE_KEY } from "@frontend/utils/auth.client";
import { detectUserTimezone } from "@frontend/utils/timezone.utils";
import * as Sentry from "@sentry/react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { toast } from "react-toastify";
import { env } from "@frontend/configs/env.config";
import { dataWorkerClient } from "@frontend/worker/worker.client";

/**
 * Auth loader for protected routes
 * Fetches session, sets React Router context, and redirects based on auth state
 */
export async function authLoader({ context }: LoaderFunctionArgs) {
	try {
		console.log("[AuthLoader] Starting auth check");
		// 1. Initialize data worker early so we can check metadata
		try {
			await dataWorkerClient.initialize(env.VITE_API_URL);
		} catch (err) {
			console.error("[AuthLoader] Failed to initialize data worker:", err);
			// We continue anyway, hoping it's just a temporary worker issue
		}

		// 2. Fetch session from better-auth client

		const session = await authClientGetSession();

		if (!session) {
			throw redirect("/auth/login");
		}

		// 3. Multi-User Isolation Check
		try {
			const syncMeta = await dataWorkerClient.getSyncMeta();
			const storedUserId = syncMeta.userId;
			const storedUserEmail = syncMeta.userEmail;

			if (storedUserId && storedUserId !== session.user.id) {
				const pendingCount = await dataWorkerClient.getPendingCount();
				if (pendingCount > 0) {
					console.warn(`[AuthLoader] User mismatch detected. Stored: ${storedUserEmail}, Active: ${session.user.email}. Pending entries: ${pendingCount}`);
					throw redirect(`/auth/conflict?newEmail=${encodeURIComponent(session.user.email)}&oldEmail=${encodeURIComponent(storedUserEmail || "unknown")}`);
				} else {
					console.log(`[AuthLoader] User mismatch detected but no pending data. Clearing cache for new user: ${session.user.email}`);
					await dataWorkerClient.clearCache();
					await dataWorkerClient.updateUserMeta(session.user.id, session.user.email);
				}
			} else if (!storedUserId) {
				console.log(`[AuthLoader] No user metadata in TinyBase. Setting owner to: ${session.user.email}`);
				await dataWorkerClient.updateUserMeta(session.user.id, session.user.email);
			}
		} catch (metaError) {
			// If it's a redirect, rethrow it
			if (metaError instanceof Response || (metaError && typeof metaError === "object" && "status" in metaError)) {
				throw metaError;
			}
			console.error("[AuthLoader] Failed to perform multi-user check:", metaError);
		}

		// 4. Update cache on success
		if (session) {
			localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
		}

		// Timezone Detection and Auto-Update
		try {
			const detectedTimezone = await detectUserTimezone();
			// Only update user on server if online and timezone actually changed
			if (navigator.onLine && detectedTimezone && detectedTimezone !== session.user.timezone) {
				toast.info(`Timezone change detected. Updating timezone to match your current location.`, {
					position: "top-center",
					autoClose: 1000,
				});

				await authClient.updateUser({ timezone: detectedTimezone });

				// Update the session user object with the new timezone
				session.user.timezone = detectedTimezone;
				// Update cache again with new timezone
				localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));

				// Show toast notification
				toast.success(`Your timezone has been updated to match your current location`, {
					position: "top-center",
					autoClose: 3000,
				});
			}
		} catch (timezoneError) {
			console.error(timezoneError);
			// Don't toast error if offline, as it's expected
			if (navigator.onLine) {
				toast.error("Timezone detection failed.");
			}
		}

		const sessionInfo = {
			hasSession: true,
			user: session.user,
			isRegistered: true, // better-auth handles registration
		};

		if (navigator.onLine) {
			Sentry.setUser({
				email: session.user.email,
				username: session.user.name,
				id: session.user.id
			})
		}

		// Set user context in React Router context
		context.set(userContext, sessionInfo);

		// Return session data for loader
		return sessionInfo;

	} catch (error) {
		console.error("Auth loader error:", error);
		throw redirect("/auth");
	}
}
