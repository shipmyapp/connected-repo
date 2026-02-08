import { type UserSelectAll, userSelectAllZod } from "@connected-repo/zod-schemas/user.zod";

const AUTH_CACHE_KEY = "auth_session_cache";
const LAST_LOGIN_KEY = "last_login_info";

export interface CachedSession {
	user: UserSelectAll;
	cachedAt: number;
}

export interface LastLoginInfo {
	name: string;
	email: string;
	image?: string | null;
}

/**
 * Saves the user session to localStorage for offline fallback.
 */
// biome-ignore lint/suspicious/noExplicitAny: better-auth user object
export const saveAuthCache = (user: any) => {
	try {
		// Validate and transform the user object using our Zod schema
		// This handles Date to number conversion for timestamps
		const validatedUser = userSelectAllZod.parse(user);
		
		const cache: CachedSession = {
			user: validatedUser,
			cachedAt: Date.now(),
		};
		localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cache));
	} catch (error) {
		console.error("Failed to save auth cache:", error);
	}
};

/**
 * Retrieves the cached auth session from localStorage.
 */
export const getAuthCache = (): CachedSession | null => {
	try {
		const cached = localStorage.getItem(AUTH_CACHE_KEY);
		if (!cached) return null;
		
		const parsed = JSON.parse(cached);
		if (!parsed || !parsed.user) return null;

		// Re-validate the cached user data
		const result = userSelectAllZod.safeParse(parsed.user);
		if (!result.success) {
			console.warn("Cached auth data is invalid:", result.error);
			return null;
		}

		return {
			user: result.data,
			cachedAt: parsed.cachedAt,
		};
	} catch (error) {
		console.error("Failed to retrieve auth cache:", error);
		return null;
	}
};

/**
 * Clears the cached auth session.
 */
export const clearAuthCache = () => {
	try {
		localStorage.removeItem(AUTH_CACHE_KEY);
	} catch (error) {
		console.error("Failed to clear auth cache:", error);
	}
};

/**
 * Saves basic user info for display on the login page after logout.
 */
export const saveLastLogin = (user: LastLoginInfo) => {
	try {
		localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({
			name: user.name,
			email: user.email,
			image: user.image,
		}));
	} catch (error) {
		console.error("Failed to save last login info:", error);
	}
};

/**
 * Retrieves the last logged-in user's info.
 */
export const getLastLogin = (): LastLoginInfo | null => {
	try {
		const info = localStorage.getItem(LAST_LOGIN_KEY);
		if (!info) return null;
		return JSON.parse(info);
	} catch (error) {
		console.error("Failed to retrieve last login info:", error);
		return null;
	}
};
