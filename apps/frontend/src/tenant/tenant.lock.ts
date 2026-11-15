import type { TeamBrandingPublic } from "@connected-repo/zod-schemas/team_app.zod";

type OfflineTenantDecision =
	| { ok: true; teamId: string | null }
	| { ok: false; reason: "no-branding" | "other-team" };

/**
 * May this origin boot its cached session without the server? On the shared
 * app (slug null): yes, with the cached active team. On a team host: only
 * when this origin has the team's branding cached AND the cached session is
 * locked to that team. The online loader writes the cached session only
 * after locking it, so a mismatch means a cache written before team hosts
 * existed or a subdomain that moved to another team. The device cannot
 * prove membership offline, so it refuses (ADR-039).
 */
export function offlineTenantDecision(input: {
	slug: string | null;
	cachedBranding: TeamBrandingPublic | null;
	cachedActiveTeamId: string | null | undefined;
}): OfflineTenantDecision {
	if (!input.slug) return { ok: true, teamId: input.cachedActiveTeamId ?? null };
	if (!input.cachedBranding) return { ok: false, reason: "no-branding" };
	if (input.cachedActiveTeamId !== input.cachedBranding.teamId) {
		return { ok: false, reason: "other-team" };
	}
	return { ok: true, teamId: input.cachedBranding.teamId };
}
