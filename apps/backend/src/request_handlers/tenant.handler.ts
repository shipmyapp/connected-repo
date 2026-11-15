import { env } from "@backend/configs/env.config";
import {
	buildTenantManifest,
	getTeamBrandingBySlugService,
} from "@backend/modules/teams/services/branding.teams.service";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { logger } from "@backend/utils/logger.utils";
import { zTenantSlug } from "@connected-repo/zod-schemas/team_app.zod";
import { resolveTenantSlug, TENANT_MANIFEST_PATH } from "@connected-repo/zod-schemas/tenant.utils";
import type { NodeHttpRequest, NodeHttpResponse } from "@orpc/standard-server-node";

/**
 * Resolve the tenant slug for an incoming request. Prefers the `Host`
 * header (what the browser actually loaded the PWA from — nginx forwards it
 * via `proxy_set_header Host $host`), falling back to `?slug=` so the route
 * is testable and usable when the frontend runs on a host that isn't under
 * `TENANT_ROOT_DOMAIN` (e.g. a Vite dev server on a plain port).
 */
export function resolveSlugFromRequest(req: NodeHttpRequest): string | null {
	const url = new URL(req.url ?? "/", "http://local");
	const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
	const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
	const fromHost = host ? resolveTenantSlug(host, env.TENANT_ROOT_DOMAIN) : null;
	if (fromHost) return fromHost;
	const fromQuery = url.searchParams.get("slug");
	if (!fromQuery) return null;
	const parsed = zTenantSlug.safeParse(fromQuery);
	return parsed.success ? parsed.data : null;
}

/**
 * `GET /api/tenant/manifest.webmanifest` — the per-team Web App Manifest.
 *
 * The frontend swaps `<link rel="manifest">` to this URL when it detects a
 * tenant host, so "Install app" on `team1.example.com` installs a PWA
 * named, coloured and iconed for that team, with its own app identity.
 * Public (the manifest is fetched without credentials by the browser).
 */
export const tenantHandler = {
	matches: (req: NodeHttpRequest): boolean =>
		(req.url ?? "").split("?")[0] === TENANT_MANIFEST_PATH,

	handle: async (req: NodeHttpRequest, res: NodeHttpResponse) => {
		if (req.method?.toUpperCase() !== "GET") {
			res.statusCode = 405;
			res.setHeader("Allow", "GET");
			res.end();
			return;
		}
		try {
			const slug = resolveSlugFromRequest(req);
			const branding = slug ? await getTeamBrandingBySlugService(slug) : null;
			if (!branding) {
				res.statusCode = 404;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ error: "Unknown tenant" }));
				return;
			}
			res.statusCode = 200;
			res.setHeader("Content-Type", "application/manifest+json");
			// Revalidate every time: a branding edit must show on the next
			// install, and the service worker never caches /api/* (sw.ts).
			res.setHeader("Cache-Control", "no-cache");
			res.end(JSON.stringify(buildTenantManifest(branding)));
		} catch (err) {
			logger.error({ err, url: req.url }, "tenant manifest handler threw");
			captureBackendException(err, {
				context: { url: req.url, method: req.method },
				tags: { handler: "tenant_manifest" },
			});
			if (!res.writableEnded) {
				res.statusCode = 500;
				res.end();
			}
		}
	},
};
