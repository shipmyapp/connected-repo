import type { TeamBrandingPublic } from "@connected-repo/zod-schemas/team_app.zod";
import { teamBrandingPublicZod } from "@connected-repo/zod-schemas/team_app.zod";
import { resolveTenantSlug } from "@connected-repo/zod-schemas/tenant.utils";
import { env } from "@frontend/configs/env.config";
import { orpcFetch } from "@frontend/utils/orpc.client";

/**
 * Tenant = "which team's private PWA is this host?"
 *
 *   app.example.com      → null  (shared app, team switcher visible)
 *   team1.example.com    → "team1" (private PWA for the team that owns it)
 *
 * Resolution is pure (`resolveTenantSlug` is shared with the backend) and
 * runs once per page load — the hostname can't change without a navigation.
 *
 * Branding is fetched through the public `teams.getBrandingBySlug` RPC and
 * cached in localStorage so an installed tenant PWA boots branded even when
 * offline. The loader and the React provider share ONE in-flight promise.
 */

const BRANDING_CACHE_PREFIX = "tenant_branding_cache:";

export const getTenantSlug = (): string | null => {
	if (typeof window === "undefined") return null;
	return resolveTenantSlug(window.location.hostname, env.VITE_TENANT_ROOT_DOMAIN);
};

export const getTenantRootDomain = (): string | null => env.VITE_TENANT_ROOT_DOMAIN ?? null;

/** Absolute URL a team's private PWA lives at, or null when tenant mode is off. */
export const tenantUrlForSlug = (slug: string): string | null => {
	const root = getTenantRootDomain();
	if (!root || typeof window === "undefined") return null;
	const { protocol, port } = window.location;
	return `${protocol}//${slug}.${root}${port ? `:${port}` : ""}`;
};

/**
 * The shared app's origin, for "go to the shared app" links on a team host:
 * `VITE_USER_APP_URL` when set (production), else `app.<root>` on this
 * protocol and port (dev: http://app.localhost:5173 is also the shared app).
 */
export const sharedAppUrl = (): string | null => {
	if (env.VITE_USER_APP_URL) return env.VITE_USER_APP_URL;
	const root = getTenantRootDomain();
	if (!root || typeof window === "undefined") return null;
	const { protocol, port } = window.location;
	return `${protocol}//app.${root}${port ? `:${port}` : ""}`;
};

export const readCachedBranding = (slug: string): TeamBrandingPublic | null => {
	try {
		const raw = localStorage.getItem(`${BRANDING_CACHE_PREFIX}${slug}`);
		if (!raw) return null;
		const parsed = teamBrandingPublicZod.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
};

const writeCachedBranding = (slug: string, branding: TeamBrandingPublic | null): void => {
	try {
		const key = `${BRANDING_CACHE_PREFIX}${slug}`;
		if (branding) localStorage.setItem(key, JSON.stringify(branding));
		else localStorage.removeItem(key);
	} catch {
		// Storage blocked (private mode) — branding simply reloads next time.
	}
};

let inflight: Promise<TeamBrandingPublic | null> | null = null;
let inflightSlug: string | null = null;

/**
 * Resolve the current host's tenant branding. `null` means either "not a
 * tenant host" or "unknown slug" — callers distinguish via `getTenantSlug()`.
 * Network failure falls back to the cached copy (offline tenant PWA boot).
 */
export const loadTenantBranding = (): Promise<TeamBrandingPublic | null> => {
	const slug = getTenantSlug();
	if (!slug) return Promise.resolve(null);
	if (inflight && inflightSlug === slug) return inflight;
	inflightSlug = slug;
	inflight = (async () => {
		try {
			// Public, and the first call a tenant host makes — before any
			// session, so it must not wait for the team header seed.
			const branding = await orpcFetch.teams.getBrandingBySlug(
				{ slug },
				{ context: { noTeam: true } },
			);
			writeCachedBranding(slug, branding);
			return branding;
		} catch (err) {
			const cached = readCachedBranding(slug);
			if (cached) return cached;
			// No cache and no network: surface so the provider can show an
			// error/retry state instead of a false "workspace not found".
			throw err;
		}
	})();
	return inflight;
};

/** Reset the memoised load (after a branding edit on the same host). */
export const invalidateTenantBranding = (): void => {
	inflight = null;
	inflightSlug = null;
};
