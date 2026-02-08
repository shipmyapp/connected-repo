import { getSWProxy } from "@frontend/sw/proxy.sw";
import { authClient } from "./auth.client";
import { clearAuthCache } from "./auth.persistence";

export const signout = async (mode?: "clear-cache") => {
    if (mode === "clear-cache") {
        // Clear local auth cache first
        clearAuthCache();
    }

    // Stop SSE monitoring on auth error
    getSWProxy()
        .then((sw) => sw.stopMonitoring())
        .catch((err) => console.error("[AuthError] Failed to stop SSE monitoring:", err));

    // Sign out and redirect to login
    try {
        await authClient.signOut({
        fetchOptions: {
            onSuccess: () => {
              if (typeof window !== 'undefined') {
                window.location.href = "/auth/login";
              }
            },
            onError: (ctx) => {
              console.error("Logout error:", ctx.error);
              if (typeof window !== 'undefined') {
                // Force redirect even if logout fails
                window.location.href = "/auth/login";
              }
            }
        }
        });
    } catch (logoutError) {
        console.error("Failed to logout:", logoutError);
        if (typeof window !== 'undefined') {
          // Force redirect even if logout fails
          window.location.href = "/auth/login";
        }
    }
}