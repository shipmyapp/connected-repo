import { userContext } from "@frontend/contexts/UserContext";
import { authClient } from "@frontend/utils/auth.client";
import { detectUserTimezone } from "@frontend/utils/timezone.utils";
import * as Sentry from "@sentry/react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { toast } from "react-toastify";

/**
 * Auth loader for protected routes
 * Fetches session, sets React Router context, and redirects based on auth state
 */
export async function authLoader({ context }: LoaderFunctionArgs) {
	try {
		// Fetch session from better-auth client
		const { data: session, error } = await authClient.getSession();

		if (error || !session) {
			throw redirect("/auth");
		};

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
			}
		} catch (timezoneError) {
			console.error(timezoneError);
			toast.error("Timezone detection failed.");
		}

		const sessionInfo = {
			hasSession: true,
			user: session.user,
			isRegistered: true, // better-auth handles registration
		};

		Sentry.setUser({
			email: session.user.email,
			username: session.user.name,
			id: session.user.id
		})

		// Set user context in React Router context
		context.set(userContext, sessionInfo);

		// Return session data for loader
		return sessionInfo;

	} catch (error) {
		console.error("Auth loader error:", error);
		throw redirect("/auth");
	}
}
