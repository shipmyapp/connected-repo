import { change } from "../db_script";

// White-label branding for a team's own host (`<slug>.<root>`): eight
// nullable columns (unset = the template's default brand) and one live team
// per subdomain. Partial on `deleted_at IS NULL`, so a soft-deleted team's
// subdomain can be assigned to another team. Additive only.
change(async (db) => {
	await db.changeTable("teams_app", (t) => ({
		slug: t.add(t.string(63).nullable()),
		appName: t.add(t.string(60).nullable()),
		appShortName: t.add(t.string(12).nullable()),
		tagline: t.add(t.string(160).nullable()),
		pwaIconUrl: t.add(t.string(2048).nullable()),
		primaryColor: t.add(t.string(7).nullable()),
		secondaryColor: t.add(t.string(7).nullable()),
		backgroundColor: t.add(t.string(7).nullable()),
		...t.add(
			t.unique(["slug"], {
				name: "teams_app_slug_idx",
				where: "deleted_at IS NULL AND slug IS NOT NULL",
			}),
		),
	}));
});
