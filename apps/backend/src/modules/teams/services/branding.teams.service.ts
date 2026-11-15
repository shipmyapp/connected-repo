import { allowedOrigins, teamHostSlugFromOrigin } from "@backend/configs/allowed_origins.config";
import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { INSTALL_PICTURES } from "@connected-repo/zod-schemas/install_pictures";
import type {
	TeamAppSelectAll,
	TeamBrandingPublic,
} from "@connected-repo/zod-schemas/team_app.zod";
import { DEFAULT_APP_BRAND } from "@connected-repo/zod-schemas/tenant.utils";

/**
 * Project a team row onto the public branding shape. Returns `null` when the
 * team has no subdomain (it has no tenant host, so nothing to brand).
 */
function toPublicBranding(team: TeamAppSelectAll): TeamBrandingPublic | null {
	if (!team.slug) return null;
	return {
		teamId: team.id,
		name: team.name,
		slug: team.slug,
		logoUrl: team.logoUrl,
		appName: team.appName,
		appShortName: team.appShortName,
		tagline: team.tagline,
		pwaIconUrl: team.pwaIconUrl,
		primaryColor: team.primaryColor,
		secondaryColor: team.secondaryColor,
		backgroundColor: team.backgroundColor,
	};
}

/**
 * Public lookup by subdomain slug. Soft-deleted teams are excluded by the
 * table's default scope, so a deleted team's subdomain goes dark at once.
 * No auth: this is what brands the login page.
 */
export async function getTeamBrandingBySlugService(
	slug: string,
): Promise<TeamBrandingPublic | null> {
	const team = await db.teamsApp.where({ slug }).takeOptional();
	return team ? toPublicBranding(team) : null;
}

/**
 * Where a team's people open the app, and what it is called there: the
 * team's own host (`<slug>.<TENANT_ROOT_DOMAIN>`, on WEBAPP_URL's scheme and
 * port) under its own app name when it has a slug and team hosts are on;
 * otherwise the shared app (WEBAPP_URL) under the template's name. For
 * links and names in emails and pushes about that team.
 */
export function teamAppIdentity(team: {
	slug: string | null;
	name: string;
	appName: string | null;
}): { origin: string; appName: string } {
	const shared = new URL(env.WEBAPP_URL);
	const root = env.TENANT_ROOT_DOMAIN?.toLowerCase().replace(/^\.+/, "");
	if (!team.slug || !root) {
		return { origin: shared.origin, appName: DEFAULT_APP_BRAND.appName };
	}
	const port = shared.port ? `:${shared.port}` : "";
	return {
		origin: `${shared.protocol}//${team.slug}.${root}${port}`,
		appName: team.appName ?? team.name,
	};
}

/** Live team id for a subdomain, or null. Used by the active-team gate. */
export async function getTeamIdBySlugService(slug: string): Promise<string | null> {
	const team = await db.teamsApp.where({ slug }).select("id").takeOptional();
	return team?.id ?? null;
}

/**
 * Build a Web App Manifest for a tenant. `start_url`/`scope` are relative, so
 * the manifest is valid on whichever host served it. Without an uploaded
 * icon it falls back to the template's bundled PNGs (apps/frontend/public).
 * An uploaded icon carries no `type`: it may be a JPEG or WebP, and a wrong
 * `type` makes Chrome skip the icon.
 */
export function buildTenantManifest(branding: TeamBrandingPublic) {
	const name = branding.appName ?? branding.name ?? DEFAULT_APP_BRAND.appName;
	const shortName = branding.appShortName ?? name.slice(0, 12);
	const icon = branding.pwaIconUrl;
	const icons = icon
		? [
				{ src: icon, sizes: "192x192", purpose: "any" },
				{ src: icon, sizes: "512x512", purpose: "any" },
				{ src: icon, sizes: "512x512", purpose: "maskable" },
			]
		: [
				{ src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
				{ src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
				{
					src: "/maskable-icon-512x512.png",
					sizes: "512x512",
					type: "image/png",
					purpose: "maskable",
				},
				{ src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
			];

	return {
		// Pins the installed app's identity to the tenant.
		id: `/?tenant=${branding.slug}`,
		name,
		short_name: shortName,
		description: branding.tagline ?? DEFAULT_APP_BRAND.tagline,
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: branding.backgroundColor ?? DEFAULT_APP_BRAND.backgroundColor,
		theme_color: branding.primaryColor ?? DEFAULT_APP_BRAND.themeColor,
		icons,
		// The same pictures as the shared app's manifest (vite.config.ts). Their
		// `src` is absolute, so they resolve on the team's host too.
		screenshots: INSTALL_PICTURES,
	};
}

/**
 * Whether `origin` may call the user-facing API with credentials: an exact
 * ALLOWED_ORIGINS entry, or the host of a team that exists now (shape from
 * `teamHostSlugFromOrigin`, then a live `teams_app` row with that slug). A
 * subdomain no team holds, `www`, `cdn`, a nested label: never.
 */
export async function isAllowedCredentialedOrigin(
	origin: string | null | undefined,
): Promise<boolean> {
	if (!origin) return false;
	if (allowedOrigins.includes(origin)) return true;
	const slug = teamHostSlugFromOrigin(origin);
	if (!slug) return false;
	return (await getTeamIdBySlugService(slug)) !== null;
}

/**
 * Team-host origins better-auth may trust for this request: the request's
 * `Origin` and the origin of its `callbackURL` query parameter, each kept only
 * if it is the host of a live team. A team host's login sends both as its own
 * origin (Login.page.tsx). Empty without a request (better-auth calls
 * `trustedOrigins` without one at start-up and from `auth.api.*`).
 */
export async function teamOriginsForAuthRequest(request?: Request): Promise<string[]> {
	if (!request) return [];
	const candidates = new Set<string>();
	const origin = request.headers.get("origin");
	if (origin) candidates.add(origin);
	try {
		const callbackURL = new URL(request.url).searchParams.get("callbackURL");
		if (callbackURL) candidates.add(new URL(callbackURL).origin);
	} catch {
		// Not a URL: nothing to add; better-auth refuses it on its own.
	}
	const trusted: string[] = [];
	for (const candidate of candidates) {
		const slug = teamHostSlugFromOrigin(candidate);
		if (slug && (await getTeamIdBySlugService(slug)) !== null) trusted.push(candidate);
	}
	return trusted;
}
