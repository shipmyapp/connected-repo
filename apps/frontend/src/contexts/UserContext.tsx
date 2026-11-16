import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";
import { createContext, useContext } from "react";
import { useOutletContext } from "react-router";

export interface SessionInfo {
	hasSession: boolean;
	user: UserSelectAll | null;
	isRegistered: boolean;
}

/** React context for user session data, provided by AppLayout from the authLoader's data. */
export const userContext = createContext<SessionInfo | null>(null);

/**
 * Hook to access session data in components
 * Session data is provided by AppLayout via Outlet context
 *
 * @returns SessionInfo object with user data and session state
 * @throws Error if used outside of authenticated routes
 */
export function useSessionInfo(): SessionInfo {
	const sessionOutlet = useOutletContext<SessionInfo>();
	const sessionProvider = useContext(userContext);
	const sessionInfo = sessionOutlet || sessionProvider;
	if (!sessionInfo) {
		throw new Error("useSessionInfo must be used within authenticated routes (under AppLayout)");
	}
	return sessionInfo;
}
