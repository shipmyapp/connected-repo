import type { TeamBrandingPublic } from "@connected-repo/zod-schemas/team_app.zod";
import { describe, expect, it } from "vitest";
import { offlineTenantDecision } from "./tenant.lock";

const TEAM_T = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TEAM_A = "01BX5ZZKBKACTAV9WEVGEMMVRZ";

const branding: TeamBrandingPublic = {
	teamId: TEAM_T,
	name: "Acme",
	slug: "acme",
	logoUrl: null,
	appName: null,
	appShortName: null,
	tagline: null,
	pwaIconUrl: null,
	primaryColor: null,
	secondaryColor: null,
	backgroundColor: null,
};

describe("offlineTenantDecision", () => {
	it("boots the shared app with the cached active team", () => {
		expect(
			offlineTenantDecision({ slug: null, cachedBranding: null, cachedActiveTeamId: TEAM_A }),
		).toEqual({ ok: true, teamId: TEAM_A });
	});

	it("refuses a team host without cached branding", () => {
		expect(
			offlineTenantDecision({ slug: "acme", cachedBranding: null, cachedActiveTeamId: TEAM_T }),
		).toEqual({ ok: false, reason: "no-branding" });
	});

	it("refuses a cached session locked to another team", () => {
		expect(
			offlineTenantDecision({ slug: "acme", cachedBranding: branding, cachedActiveTeamId: TEAM_A }),
		).toEqual({ ok: false, reason: "other-team" });
		expect(
			offlineTenantDecision({ slug: "acme", cachedBranding: branding, cachedActiveTeamId: null }),
		).toEqual({ ok: false, reason: "other-team" });
	});

	it("boots a team host locked to the cached branding's team", () => {
		expect(
			offlineTenantDecision({ slug: "acme", cachedBranding: branding, cachedActiveTeamId: TEAM_T }),
		).toEqual({ ok: true, teamId: TEAM_T });
	});
});
