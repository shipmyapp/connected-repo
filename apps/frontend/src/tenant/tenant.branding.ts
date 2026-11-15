import type { TeamBrandingPublic } from "@connected-repo/zod-schemas/team_app.zod";
import { DEFAULT_APP_BRAND } from "@connected-repo/zod-schemas/tenant.utils";

/** The template's own identity, used wherever a team leaves a field unset. */
const DEFAULT_BRAND = {
	appName: DEFAULT_APP_BRAND.appName,
	shortName: DEFAULT_APP_BRAND.shortName,
	tagline: DEFAULT_APP_BRAND.tagline,
	themeColor: DEFAULT_APP_BRAND.themeColor,
	backgroundColor: DEFAULT_APP_BRAND.backgroundColor,
	iconUrl: "/apple-touch-icon.png",
	logoUrl: null as string | null,
} as const;

export interface ResolvedBrand {
	appName: string;
	shortName: string;
	tagline: string;
	themeColor: string;
	backgroundColor: string;
	iconUrl: string;
	logoUrl: string | null;
	primaryColor: string | null;
	secondaryColor: string | null;
}

/** Merge a tenant's branding over the stock defaults. */
export const resolveBrand = (branding: TeamBrandingPublic | null | undefined): ResolvedBrand => {
	if (!branding) {
		return {
			...DEFAULT_BRAND,
			primaryColor: null,
			secondaryColor: null,
		};
	}
	const appName = branding.appName ?? branding.name ?? DEFAULT_BRAND.appName;
	return {
		appName,
		shortName: branding.appShortName ?? appName.slice(0, 12),
		tagline: branding.tagline ?? DEFAULT_BRAND.tagline,
		themeColor: branding.primaryColor ?? DEFAULT_BRAND.themeColor,
		backgroundColor: branding.backgroundColor ?? DEFAULT_BRAND.backgroundColor,
		iconUrl: branding.pwaIconUrl ?? branding.logoUrl ?? DEFAULT_BRAND.iconUrl,
		logoUrl: branding.logoUrl ?? branding.pwaIconUrl ?? null,
		primaryColor: branding.primaryColor,
		secondaryColor: branding.secondaryColor,
	};
};
