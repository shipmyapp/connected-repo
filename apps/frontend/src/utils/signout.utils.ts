import { authClient } from "./auth.client";
import { clearAuthCache } from "./auth.persistence";
import { revokePushForUser } from "./push.utils";

export const signout = async (mode?: "clear-cache") => {
    if (mode === "clear-cache") {
        clearAuthCache();
    }

    // Revoke the FCM token before the session goes away — after signOut()
    // succeeds we've navigated away and the oRPC call would 401. Failures
    // are logged inside revokePushForUser, never thrown, so a broken push
    // cleanup does not block the user from actually logging out.
    //
    // Race against a 2s ceiling so a stuck backend can't strand the user on
    // the signout button. Cleanup is best-effort — the nightly reconcile
    // (reconcile_fcm_tokens cron) covers whatever leaked.
    await Promise.race([
        revokePushForUser(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);

    try {
        await authClient.signOut({
            fetchOptions: {
                onSuccess: () => {
                    if (typeof window !== "undefined") {
                        window.location.href = "/auth/login";
                    }
                },
                onError: (ctx) => {
                    console.error("Logout error:", ctx.error);
                    if (typeof window !== "undefined") {
                        window.location.href = "/auth/login";
                    }
                },
            },
        });
    } catch (logoutError) {
        console.error("Failed to logout:", logoutError);
        if (typeof window !== "undefined") {
            window.location.href = "/auth/login";
        }
    }
};
