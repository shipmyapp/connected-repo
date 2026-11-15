import { useAsksStore } from "@frontend/lib/asks/asks.store";
import { authClient } from "./auth.client";
import { clearAuthCache } from "./auth.persistence";
import { unbindPushAccount } from "./push.utils";

export const signout = async (mode?: "clear-cache") => {
	if (mode === "clear-cache") {
		clearAuthCache();
	}

	// Turn push off for this device before the session goes away — after signOut()
	// succeeds we've navigated away and the oRPC call would 401. Failures
	// are logged inside unbindPushAccount, never thrown, so a broken push
	// cleanup does not block the user from actually logging out.
	//
	// Race against a 2s ceiling so a stuck backend can't strand the user on
	// the signout button. Cleanup is best-effort — the nightly reconcile
	// (reconcile_fcm_tokens cron) covers whatever leaked.
	await Promise.race([unbindPushAccount(), new Promise((resolve) => setTimeout(resolve, 2000))]);
	// The next account on this device starts with its own answers to the asks.
	useAsksStore.getState().reset();

	try {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					if (typeof window !== "undefined") {
						// Replace, not push: Back after signing out must not reopen a signed-in page.
						window.location.replace("/auth/login");
					}
				},
				onError: (ctx) => {
					console.error("Logout error:", ctx.error);
					if (typeof window !== "undefined") {
						window.location.replace("/auth/login");
					}
				},
			},
		});
	} catch (logoutError) {
		console.error("Failed to logout:", logoutError);
		if (typeof window !== "undefined") {
			window.location.replace("/auth/login");
		}
	}
};
