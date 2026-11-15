import type { TeamBrandingPublic } from "@connected-repo/zod-schemas/team_app.zod";
import { TENANT_MANIFEST_PATH } from "@connected-repo/zod-schemas/tenant.utils";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { type ResolvedBrand, resolveBrand } from "./tenant.branding";
import {
	getTenantSlug,
	invalidateTenantBranding,
	loadTenantBranding,
	readCachedBranding,
} from "./tenant.resolver";

type TenantStatus = "none" | "loading" | "ready" | "not-found" | "error";

export interface TenantState {
	/** Subdomain slug when this host is a tenant PWA; null on the shared app. */
	slug: string | null;
	/** True on `<slug>.<root>` hosts, regardless of whether the slug resolved. */
	isTenant: boolean;
	status: TenantStatus;
	branding: TeamBrandingPublic | null;
	/** Team id this host is locked to (tenant mode) — null on the shared app. */
	tenantTeamId: string | null;
	brand: ResolvedBrand;
	/** Re-fetch branding (after the team edits it on this same host). */
	refresh: () => Promise<void>;
}

const TenantContext = createContext<TenantState | undefined>(undefined);

/**
 * Swap the document's identity to the tenant: title, theme-color, manifest
 * link (→ the per-team manifest route) and icons. Runs once per branding
 * change; the shared app keeps the static `index.html` values.
 */
function applyDocumentBranding(brand: ResolvedBrand, slug: string | null): void {
	if (typeof document === "undefined") return;
	document.title = brand.appName;

	const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
	if (themeMeta) themeMeta.content = brand.themeColor;

	if (!slug) return;

	const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
	// `?slug=`: the Vite dev proxy rewrites Host (changeOrigin), so the
	// backend cannot read the team from it in dev. Production reads Host first.
	if (manifest) manifest.href = `${TENANT_MANIFEST_PATH}?slug=${encodeURIComponent(slug)}`;

	const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
	if (apple) apple.href = brand.iconUrl;

	// The tab's icon too. `index.html` ships three `rel="icon"` links (ico,
	// svg, two png sizes) so the browser can pick by format; a tenant has one
	// picture, so every link points at it and the format and size hints that
	// described the template's files are dropped — a `type="image/svg+xml"`
	// left on a link to a png makes Chrome skip it, and the tab would keep
	// showing the template's icon on a team's own subdomain.
	for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
		link.href = brand.iconUrl;
		link.removeAttribute("type");
		link.removeAttribute("sizes");
	}
	const appleTitle =
		document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]') ??
		(() => {
			const m = document.createElement("meta");
			m.name = "apple-mobile-web-app-title";
			document.head.appendChild(m);
			return m;
		})();
	appleTitle.content = brand.shortName;
}

export const TenantProvider = ({ children }: { children: ReactNode }) => {
	const slug = useMemo(() => getTenantSlug(), []);
	const isTenant = slug !== null;
	// Boot from the localStorage copy so an installed tenant PWA paints its
	// own colours on the very first frame, then confirm over the network.
	const [branding, setBranding] = useState<TeamBrandingPublic | null>(() =>
		slug ? readCachedBranding(slug) : null,
	);
	const [status, setStatus] = useState<TenantStatus>(() =>
		slug ? (readCachedBranding(slug) ? "ready" : "loading") : "none",
	);

	// Stable for the page's lifetime (slug never changes without a navigation),
	// so it can sit in dependency lists without re-triggering effects.
	const load = useCallback(async () => {
		if (!slug) return;
		try {
			const result = await loadTenantBranding();
			setBranding(result);
			setStatus(result ? "ready" : "not-found");
		} catch {
			setStatus((prev) => (prev === "ready" ? prev : "error"));
		}
	}, [slug]);

	useEffect(() => {
		void load();
	}, [load]);

	const brand = useMemo(() => resolveBrand(branding), [branding]);

	useEffect(() => {
		applyDocumentBranding(brand, slug);
	}, [brand, slug]);

	const value = useMemo<TenantState>(
		() => ({
			slug,
			isTenant,
			status,
			branding,
			tenantTeamId: branding?.teamId ?? null,
			brand,
			refresh: async () => {
				invalidateTenantBranding();
				await load();
			},
		}),
		[slug, isTenant, status, branding, brand, load],
	);

	return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = (): TenantState => {
	const ctx = useContext(TenantContext);
	if (!ctx) throw new Error("useTenant must be used within TenantProvider");
	return ctx;
};
