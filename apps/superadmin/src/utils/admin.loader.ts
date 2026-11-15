import { accessStateOf } from "@connected-repo/ui-mui/utils/rpc_errors";
import { authClient } from "@superadmin/utils/auth.client";
import { orpcFetch } from "@superadmin/utils/orpc.client";
import { redirect } from "react-router";

export interface AdminSession {
	user: { id: string; email: string | null; name: string };
}

/**
 * Route loader for every console page. No session → /login. A session not
 * on the super-admin allowlist → /denied. The backend's `ping` is the source
 * of truth; nothing is decided here, and every later call is gated again.
 */
export async function adminLoader(): Promise<AdminSession> {
	const { data: session, error } = await authClient.getSession();
	if (error || !session) throw redirect("/login");
	try {
		const res = await orpcFetch.ping();
		return { user: res.user };
	} catch (err) {
		const access = accessStateOf(err);
		if (access === "NOT_SUPER_ADMIN") throw redirect("/denied");
		if (access === "SIGNED_OUT") throw redirect("/login");
		throw err;
	}
}
