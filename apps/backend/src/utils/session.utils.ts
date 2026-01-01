/**
 * Session and User data transformation utilities
 * 
 * These utilities transform raw session data from better-auth into the format
 * expected by the application, including:
 * - Converting ISO date strings to Unix timestamps
 * - Normalizing nullable fields to null instead of undefined
 */

import type { BetterAuthSession } from "@backend/modules/auth/auth.config";
import type { ActiveSessionSelectAll } from "@backend/modules/auth/tables/session.auth.table";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";

/**
 * Transforms raw session data from better-auth into application format
 * 
 * @param rawSession - Raw session data from better-auth
 * @returns Transformed session with Unix timestamps and normalized null values
 * 
 * @example
 * ```typescript
 * const sessionData = await auth.api.getSession({ headers });
 * const session = transformSessionData(sessionData.session);
 * ```
 */
const transformSessionData = (rawSession: BetterAuthSession["session"]): ActiveSessionSelectAll => {
	return {
		...rawSession,
		userAgent: rawSession.userAgent ?? null,
		ipAddress: rawSession.ipAddress ?? null,
		browser: rawSession.browser ?? null,
		deviceFingerprint: rawSession.deviceFingerprint ?? null,
		os: rawSession.os ?? null,
		device: rawSession.device ?? null,
		createdAt: new Date(rawSession.createdAt).getTime(),
		updatedAt: new Date(rawSession.updatedAt).getTime(),
		markedInvalidAt: rawSession.markedInvalidAt ? new Date(rawSession.markedInvalidAt).getTime() : null,
		expiresAt: new Date(rawSession.expiresAt).getTime(),
	};
};

/**
 * Transforms raw user data from better-auth into application format
 * 
 * @param rawUser - Raw user data from better-auth
 * @returns Transformed user with Unix timestamps and normalized null values
 * 
 * @example
 * ```typescript
 * const sessionData = await auth.api.getSession({ headers });
 * const user = transformUserData(sessionData.user);
 * ```
 */
const transformUserData = (rawUser: BetterAuthSession["user"]): UserSelectAll => {
	return {
		...rawUser,
		image: rawUser.image ?? null,
		createdAt: new Date(rawUser.createdAt).getTime(),
		updatedAt: new Date(rawUser.updatedAt).getTime(),
	};
};

/**
 * Transforms complete session data (both session and user) from better-auth
 * 
 * @param sessionData - Raw session data object containing session and user
 * @returns Object with transformed session and user data
 * 
 * @example
 * ```typescript
 * const sessionData = await auth.api.getSession({ headers });
 * const { session, user } = transformSessionAndUserData(sessionData);
 * ```
 */
export const transformSessionAndUserData = (sessionData: BetterAuthSession): {
	session: ActiveSessionSelectAll;
	user: UserSelectAll;
} => {
	return {
		session: transformSessionData(sessionData.session),
		user: transformUserData(sessionData.user),
	};
};
