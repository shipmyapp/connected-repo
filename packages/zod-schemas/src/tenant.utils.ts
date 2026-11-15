/**
 * Tenant (per-team subdomain) resolution helpers — shared by the frontend
 * (reads `window.location.hostname`) and the backend (reads the `Host`
 * header for the manifest route) so both sides agree on what counts as a
 * tenant host.
 *
 * Layout:
 *   app.<root>      → the shared app: normal login + team switching.
 *   <slug>.<root>   → a private, single-team PWA (branding from `teams_app`).
 *   <root>, www.<root>, api.<root> … → reserved, never a tenant.
 *
 * `root` is `TENANT_ROOT_DOMAIN` / `VITE_TENANT_ROOT_DOMAIN`, e.g.
 * `example.com` in prod or `localhost` in dev (Chrome resolves
 * `team1.localhost` to 127.0.0.1 without any hosts-file edits).
 */

/** Subdomain labels that can never be claimed by a team. */
export const RESERVED_TENANT_SLUGS = [
	"app",
	"sa",
	"www",
	"api",
	"admin",
	"auth",
	"mail",
	"static",
	"cdn",
	"assets",
	"staging",
	"sa-staging",
	"dev",
	"test",
	"localhost",
	"superadmin",
	// Add your product's own name here when you fork the template.
] as const;

/**
 * DNS-label shaped: lowercase alphanumerics and hyphens, no leading or
 * trailing hyphen, 3–63 chars. Also rejects the reserved labels above.
 */
export const TENANT_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export const isReservedTenantSlug = (slug: string): boolean =>
	(RESERVED_TENANT_SLUGS as readonly string[]).includes(slug);

/**
 * Resolve the tenant slug from a hostname. Returns `null` for the shared
 * app host, the bare root, reserved labels, hosts outside `rootDomain`,
 * and nested subdomains (`a.b.root`) which are not supported.
 */
export function resolveTenantSlug(
	hostname: string,
	rootDomain: string | undefined | null,
): string | null {
	if (!rootDomain) return null;
	const host = hostname.toLowerCase().split(":")[0] ?? "";
	const root = rootDomain.toLowerCase().replace(/^\.+/, "").split(":")[0] ?? "";
	if (!root || host === root) return null;
	if (!host.endsWith(`.${root}`)) return null;
	const label = host.slice(0, -(root.length + 1));
	if (!label || label.includes(".")) return null;
	if (isReservedTenantSlug(label)) return null;
	if (!TENANT_SLUG_REGEX.test(label)) return null;
	return label;
}

/** Path of the per-team Web App Manifest (backend `tenant.handler.ts`). */
export const TENANT_MANIFEST_PATH = "/api/tenant/manifest.webmanifest";

/**
 * The template's own identity: what every unset branding field falls back
 * to, on the backend (tenant manifest) and the frontend (document, theme,
 * navbar). Must match `apps/frontend/index.html` (title, theme-color) and the
 * VitePWA `manifest` in `apps/frontend/vite.config.ts`. Rename all three
 * together when you fork.
 */
export const DEFAULT_APP_BRAND = {
	appName: "OneQ",
	shortName: "OneQ",
	tagline: "Helps you journal",
	themeColor: "#1976d2",
	backgroundColor: "#ffffff",
} as const;
