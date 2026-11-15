import { authClient } from "@superadmin/utils/auth.client";

/**
 * Signs out and lands on the console's login page whatever the backend
 * answers. With the session cookie shared across subdomains, this also
 * signs the operator out of the app.
 */
export const signOut = async (): Promise<void> => {
	try {
		await authClient.signOut();
	} finally {
		window.location.assign("/login");
	}
};
