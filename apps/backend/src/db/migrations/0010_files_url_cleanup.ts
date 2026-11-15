import { change } from "../db_script";

// Stored file URLs that are not http(s) could only come from the old create
// paths, which accepted any URL (a `javascript:` URL ran when a teammate
// opened the attachment). Clear them, and bump updated_at so pull-delta sync
// carries the cleared value to every device. One way: the values are not
// restorable and were never valid.
change(async (db, up) => {
	if (!up) return;
	await db.adapter.query(`
		UPDATE "files"
		SET
			"cdn_url" = CASE WHEN "cdn_url" ~* '^https?://' THEN "cdn_url" END,
			"thumbnail_cdn_url" = CASE WHEN "thumbnail_cdn_url" ~* '^https?://' THEN "thumbnail_cdn_url" END,
			"updated_at" = clock_timestamp()
		WHERE ("cdn_url" IS NOT NULL AND "cdn_url" !~* '^https?://')
			OR ("thumbnail_cdn_url" IS NOT NULL AND "thumbnail_cdn_url" !~* '^https?://')
	`);
});
