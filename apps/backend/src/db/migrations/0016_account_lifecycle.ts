import { change } from "../db_script";

// Account lifecycle:
// - users: a deletion request (purged by purge_deleted_accounts.cron after
//   ACCOUNT_DELETION_GRACE_DAYS), and the Terms/Privacy version accepted.
// - storage_object_deletions: bucket objects to delete after the rows that
//   pointed at them are gone (drained by the purge cron).
// - erased_device_keys: device keys of purged accounts; those devices erase
//   their local copy when they next come online.
change(async (db) => {
	await db.changeTable("users", (t) => ({
		deletionRequestedAt: t.add(t.timestamp().nullable()),
		legalAcceptedVersion: t.add(t.string(32).nullable()),
		legalAcceptedAt: t.add(t.timestamp().nullable()),
	}));

	await db.createTable("storage_object_deletions", (t) => ({
		objectKey: t.text().primaryKey(),
		attempts: t.integer().default(0),
		lastError: t.text().nullable(),
		createdAt: t.timestamps().createdAt,
		updatedAt: t.timestamps().updatedAt,
	}));

	await db.createTable("erased_device_keys", (t) => ({
		deviceKey: t.string(64).primaryKey(),
		createdAt: t.timestamps().createdAt,
		updatedAt: t.timestamps().updatedAt,
	}));
});

// Its own change so `down` drops the index before the column it is on.
change(async (db) => {
	await db.addIndex("users", ["deletionRequestedAt"], {
		name: "users_deletion_requested_at_idx",
		where: "deletion_requested_at IS NOT NULL",
	});
});

// A shared team survives the deletion of the account that created it:
// teams_app.created_by_user_id ON DELETE CASCADE → SET NULL, column nullable.
// The constraint is found by its column, whatever name 0001 gave it.
change(async (db, up) => {
	await db.adapter.query(`
		DO $$
		DECLARE c text;
		BEGIN
			SELECT con.conname INTO c
			FROM pg_constraint con
			JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
			WHERE con.conrelid = 'teams_app'::regclass AND con.contype = 'f'
				AND a.attname = 'created_by_user_id';
			IF c IS NOT NULL THEN
				EXECUTE format('ALTER TABLE teams_app DROP CONSTRAINT %I', c);
			END IF;
		END $$;
	`);
	if (up) {
		await db.adapter.query(`
			ALTER TABLE teams_app ALTER COLUMN created_by_user_id DROP NOT NULL;
			ALTER TABLE teams_app ADD CONSTRAINT teams_app_created_by_user_id_fkey
				FOREIGN KEY (created_by_user_id) REFERENCES users (id)
				ON UPDATE RESTRICT ON DELETE SET NULL;
		`);
	} else {
		// Fails (on purpose) when a team has already lost its creator.
		await db.adapter.query(`
			ALTER TABLE teams_app ALTER COLUMN created_by_user_id SET NOT NULL;
			ALTER TABLE teams_app ADD CONSTRAINT teams_app_created_by_user_id_fkey
				FOREIGN KEY (created_by_user_id) REFERENCES users (id)
				ON UPDATE RESTRICT ON DELETE CASCADE;
		`);
	}
});

// Repair what the old team deletion left: live memberships of deleted teams
// (still listed by listMyActiveTeamIds, still passing the active-team gate),
// and accounts whose active team is a deleted team. Rows are updated, never
// removed; nothing to undo.
change(async (db, up) => {
	if (!up) return;
	await db.adapter.query(`
		UPDATE team_members m
		SET deleted_at = now(), updated_at = now()
		FROM teams_app t
		WHERE m.team_id = t.id AND t.deleted_at IS NOT NULL AND m.deleted_at IS NULL;

		UPDATE users u
		SET active_team_app_id = p.id, updated_at = now()
		FROM teams_app a, teams_app p
		WHERE u.active_team_app_id = a.id AND a.deleted_at IS NOT NULL
			AND p.personal_team_for_user_id = u.id AND p.deleted_at IS NULL;
	`);
});
