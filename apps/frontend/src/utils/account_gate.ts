import { LEGAL_VERSION } from "@connected-repo/zod-schemas/legal.zod";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";

/**
 * Where an account must go before the app: the deletion-pending page while a
 * deletion is scheduled (online and offline), the agreement page when the
 * legal texts are configured and this account has not agreed to the current
 * version (online only: never block offline use on paperwork). Null = the app.
 */
export function accountGateRedirect(
	user: Pick<UserSelectAll, "deletionRequestedAt" | "legalAcceptedVersion">,
	location: { pathname: string; search: string },
	options: { online: boolean; legalConfigured: boolean },
): string | null {
	if (user.deletionRequestedAt !== null) return "/account/deletion-pending";
	if (options.online && options.legalConfigured && user.legalAcceptedVersion !== LEGAL_VERSION) {
		return `/legal/accept?next=${encodeURIComponent(location.pathname + location.search)}`;
	}
	return null;
}

/** Where to go after agreeing: a path on this app only, never another site. */
export function safeNextPath(next: string | null): string {
	return next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
		? next
		: "/dashboard";
}
