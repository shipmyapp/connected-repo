import { userContext } from "@frontend/contexts/UserContext";
import { authClient } from "@frontend/utils/auth.client";
import * as Sentry from "@sentry/react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/**
 * Auth loader for protected routes
 * Fetches session, sets React Router context, and redirects based on auth state
 */
export async function authLoader({ context }: LoaderFunctionArgs) {
	try {
		// Fetch session from better-auth client
		const { data: session, error } = await authClient.getSession();

		if (error || !session) {
			throw redirect("/auth/login");
		}

		const sessionInfo = {
			hasSession: true,
			user: {
				email: session.user.email,
				name: session.user.name,
				displayPicture: session.user.image,
			},
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
		throw redirect("/auth/login");
	}
}
