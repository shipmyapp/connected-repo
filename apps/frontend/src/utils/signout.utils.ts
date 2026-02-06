import { getSWProxy } from "@frontend/sw/proxy.sw";
import { authClient } from "./auth.client";

export const signout = async () => {
    // Stop SSE monitoring on auth error
    getSWProxy()
        .then((sw) => sw.stopMonitoring())
        .catch((err) => console.error("[AuthError] Failed to stop SSE monitoring:", err));

    // Sign out and redirect to login
    try {
        await authClient.signOut({
        fetchOptions: {
            onSuccess: () => {
            window.location.href = "/auth/login";
            },
            onError: (ctx) => {
            console.error("Logout error:", ctx.error);
            // Force redirect even if logout fails
            window.location.href = "/auth/login";
            }
        }
        });
    } catch (logoutError) {
        console.error("Failed to logout:", logoutError);
        // Force redirect even if logout fails
        window.location.href = "/auth/login";
    }
}