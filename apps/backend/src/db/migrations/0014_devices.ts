import { change } from "../db_script";

// One device record per account and device (installs, push address,
// permissions), keyed by the device cookie (`app_device`) or a native app's
// `x-device-id`. Replaces push_devices, which stays unread for one release
// (expand/contract, ADR-B01) and is dropped by the next release's migration.
change(async (db) => {
	await db.createTable(
		"devices",
		(t) => ({
			id: t.string(26).primaryKey(),
			userId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			deviceKey: t.string(64),
			platform: t.string(10),
			browser: t.string(64).nullable(),
			os: t.string(64).nullable(),
			model: t.string(64).nullable(),
			osVersion: t.string(32).nullable(),
			screen: t.string(32).nullable(),
			timeZone: t.string(64).nullable(),
			language: t.string(35).nullable(),
			isStandalone: t.boolean().default(false),
			installedAt: t.timestamp().nullable(),
			openedInstalledAt: t.timestamp().nullable(),
			pushPermission: t.string(12).nullable(),
			fcmToken: t.text().nullable(),
			pushOffAt: t.timestamp().nullable(),
			pushOffReason: t.string(30).nullable(),
			installTries: t.json().nullable(),
			firstSeenAt: t.timestamp(),
			lastSeenAt: t.timestamp(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) => [
			t.unique(["userId", "deviceKey"], { name: "devices_user_device_key_idx" }),
			// One live holder of a push address; reportDevice turns the others off first.
			t.unique(["fcmToken"], {
				name: "devices_fcm_token_live_idx",
				where: "fcm_token IS NOT NULL AND push_off_at IS NULL",
			}),
		],
	);

	await db.changeTable("sessions", (t) => ({
		deviceKey: t.add(t.string(64).nullable()),
	}));

	await db.changeTable("users", (t) => ({
		asks: t.add(t.json().default(t.sql`'{}'::jsonb`)),
	}));
});

// Every live push_devices row becomes a device under the key `legacy-<id>`,
// which no cookie or header ever carries, so it never counts as "this device";
// its push address keeps reaching the person until the device reports under
// its real key and takes the address over (`replaced`). Accounts with a live
// address have said yes to push already: that yes is written to their asks,
// so syncPushIfGranted keeps registering them without a question.
change(async (db, up) => {
	if (!up) return; // The rows and the column go with the step above.
	await db.adapter.query(
		`INSERT INTO devices (
				id, user_id, device_key, platform, is_standalone, installed_at, opened_installed_at,
				push_permission, fcm_token, first_seen_at, last_seen_at, created_at, updated_at
			)
			SELECT p.id, p.user_id, 'legacy-' || p.id,
				CASE WHEN p.platform IN ('ios', 'android') THEN p.platform ELSE 'desktop' END,
				false, p.pwa_installed_at, p.pwa_last_launched_at,
				'granted', p.fcm_token, p.created_at, p.last_seen_at, p.created_at, p.updated_at
			FROM push_devices p
			WHERE p.uninstalled_at IS NULL
			ON CONFLICT DO NOTHING`,
	);
	await db.adapter.query(
		`UPDATE users u
			SET asks = coalesce(u.asks, '{}'::jsonb) || jsonb_build_object(
				'push',
				coalesce(u.asks->'push', '{}'::jsonb)
					|| jsonb_build_object('grantedAt', (extract(epoch FROM now()) * 1000)::bigint)
			)
			WHERE (u.asks->'push'->>'grantedAt') IS NULL
				AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = u.id AND d.uninstalled_at IS NULL)`,
	);
});
