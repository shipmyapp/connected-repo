import { env, isDev, isTest } from "@backend/configs/env.config";
import { resolveTenantSlug } from "@connected-repo/zod-schemas/tenant.utils";

// Remove trailing slashes from origins (origins should never have trailing slashes)
export const allowedOrigins = (env.ALLOWED_ORIGINS?.split(",") || []).filter(
	(origin) => origin.length > 0,
);

/** Plain http and explicit ports are accepted for team hosts in local development and tests only. */
const lenientTeamHosts = isDev || isTest;

/**
 * The team slug an origin names, from its shape alone (no database), or null.
 *
 * A team host is `https://<label>.<root>` on the default port, nothing after
 * the host, exactly one label, not a reserved label and shaped like a slug
 * (`resolveTenantSlug`). `http` and explicit ports only when `lenient`
 * (development, tests). Null for the bare root, `www.<root>`, `cdn.<root>`,
 * `a.b.<root>`, another domain, and anything that is not a bare origin.
 *
 * Shape is not enough to trust an origin: callers also require a live team
 * with that slug (`isAllowedCredentialedOrigin` in branding.teams.service.ts).
 */
export function teamHostSlugFromOrigin(
	origin: string | null | undefined,
	root: string | undefined = env.TENANT_ROOT_DOMAIN,
	lenient: boolean = lenientTeamHosts,
): string | null {
	if (!origin || !root) return null;
	let url: URL;
	try {
		url = new URL(origin);
	} catch {
		return null;
	}
	// A browser's Origin header is exactly scheme://host[:port]. Anything else
	// (a path, a query, userinfo, a trailing slash) is not an origin.
	if (url.origin !== origin) return null;
	if (lenient) {
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	} else if (url.protocol !== "https:" || url.port !== "") {
		return null;
	}
	return resolveTenantSlug(url.hostname, root);
}
