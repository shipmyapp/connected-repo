import { authClient } from "./auth.client";
import { clearAuthCache } from "./auth.persistence";

export const signout = async (mode?: "clear-cache") => {
    if (mode === "clear-cache") {
        clearAuthCache();
    }

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
