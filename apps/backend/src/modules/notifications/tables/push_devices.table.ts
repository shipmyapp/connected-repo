import { BaseTable } from "@backend/db/base_table";

/** Superseded by `devices` (migration 0014_devices). Read and written by nothing; dropped in the next release. */
export class PushDeviceTable extends BaseTable {
	readonly table = "push_devices";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			userId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			// Uniqueness is a partial unique index on active rows (declared below).
			// Soft-deleted history rows can share a token across reactivation cycles.
			fcmToken: t.text(),
			userAgent: t.text().nullable(),
			// Reported by the frontend at register time. "ios" | "android" |
			// "desktop" — nullable so old rows and unknown UAs coexist. Used to
			// skip dispatch to iOS non-PWA devices that can't receive push at all.
			platform: t.string(20).nullable(),
			// Null = never observed as installed on this device. Timestamp = the
			// first time we saw display-mode standalone / getInstalledRelatedApps.
			pwaInstalledAt: t.timestampNumber().nullable(),
			// Updated on each PWA (standalone) launch. Used to heuristically detect
			// probable uninstalls (installed_at set, last_launched_at stale, user
			// active in browser mode). Authoritative "can we push?" answer is still
			// FCM feedback (registration-token-not-registered → prune the row).
			pwaLastLaunchedAt: t.timestampNumber().nullable(),
			// Soft-delete signal. Set when the FCM token disappears from Novu's
			// subscriber credentials (see reconcile_devices) OR when the user
			// explicitly revokes push on this device. NULL = active. Cleared
			// on re-register so a device that comes back doesn't leave a stale
			// timestamp behind.
			uninstalledAt: t.timestampNumber().nullable(),
			// Companion to uninstalledAt — separates voluntary churn from
			// upstream-driven prune for analytics. Values come from
			// deviceDeactivationReasonZod in @connected-repo/zod-schemas/enums.zod.
			deactivationReason: t.string(30).nullable(),
			lastSeenAt: t.timestampNumber(),
			...t.timestampsAsNumbers(),
		}),
		(t) => [
			t.index(["userId", { column: "lastSeenAt", order: "DESC" }], {
				name: "push_devices_user_id_last_seen_at_idx",
			}),
			// Active devices of a user (migration 0005).
			t.index(["userId"], {
				name: "push_devices_user_active_idx",
				where: "uninstalled_at IS NULL",
			}),
			// One active row per token; soft-deleted history may repeat it (migration 0007).
			t.unique(["fcmToken"], {
				name: "push_devices_fcm_token_active_idx",
				where: "uninstalled_at IS NULL",
			}),
		],
	);
}
