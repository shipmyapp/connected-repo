import { type UserSelectAll, userSelectAllZod } from "@connected-repo/zod-schemas/user.zod";
import { setActiveTeamIdForRequests } from "@frontend/utils/active_team_header.client";
import { authClient } from "@frontend/utils/auth.client";
import { getAuthCache } from "@frontend/utils/auth.persistence";
import { consumeFreshSessionRequest } from "@frontend/utils/session_refresh.client";
import { redirect } from "react-router";

/**
 * For the pages outside the app shell (deletion pending, the legal
 * agreement): a signed-in user or the sign-in page. No sync starts.
 */
export async function sessionOnlyLoader(): Promise<{ user: UserSelectAll }> {
	if (!navigator.onLine) {
		const cached = getAuthCache();
		if (!cached) throw redirect("/auth/login");
		setActiveTeamIdForRequests(cached.user.activeTeamAppId ?? null);
		return { user: cached.user };
	}
	const disableCookieCache = consumeFreshSessionRequest();
	const { data } = await authClient.getSession(
		disableCookieCache ? { query: { disableCookieCache: true } } : undefined,
	);
	if (!data) throw redirect("/auth/login");
	const user = userSelectAllZod.parse(data.user);
	setActiveTeamIdForRequests(user.activeTeamAppId ?? null);
	return { user };
}
