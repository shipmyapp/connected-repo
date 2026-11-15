import { BaseTable } from "@backend/db/base_table";
import type {
	AppPlatform,
	DevicePermission,
	InstallTry,
	PushOffReason,
} from "@connected-repo/zod-schemas/device.zod";

/**
 * One row per device, per account: installs, push address and permissions for
 * the phone, tablet or computer in the person's hand, keyed by the device key
 * (`app_device` cookie, or a native app's `x-device-id`). Replaces
 * `push_devices` (live rows copied as `legacy-<id>`, never "this device").
 * Only what a rule or a screen reads; the rules (an iPhone's Safari paired
 * with its Home Screen app, probably uninstalled) are applied when read
 * (`@connected-repo/zod-schemas/devices/devices.rules`). Not synced to the
 * client (server state, read through `devices.here`).
 */
export class DeviceTable extends BaseTable {
	readonly table = "devices";

	columns = this.setColumns(
		(t) => ({
			id: t.ulid().primaryKey(),
			userId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			deviceKey: t.string(64),
			platform: t.string(10).narrowType((c) => c<AppPlatform>()),
			browser: t.string(64).nullable(),
			os: t.string(64).nullable(),
			model: t.string(64).nullable(),
			osVersion: t.string(32).nullable(),
			screen: t.string(32).nullable(),
			timeZone: t.string(64).nullable(),
			language: t.string(35).nullable(),
			isStandalone: t.boolean().default(false),
			installedAt: t.timestampNumber().nullable(),
			openedInstalledAt: t.timestampNumber().nullable(),
			pushPermission: t
				.string(12)
				.narrowType((c) => c<DevicePermission>())
				.nullable(),
			fcmToken: t.text().nullable(),
			pushOffAt: t.timestampNumber().nullable(),
			pushOffReason: t
				.string(30)
				.narrowType((c) => c<PushOffReason>())
				.nullable(),
			installTries: t.json<InstallTry>().nullable(),
			firstSeenAt: t.timestampNumber(),
			lastSeenAt: t.timestampNumber(),
			...t.timestampsAsNumbers(),
		}),
		(t) => [
			t.unique(["userId", "deviceKey"], { name: "devices_user_device_key_idx" }),
			t.unique(["fcmToken"], {
				name: "devices_fcm_token_live_idx",
				where: "fcm_token IS NOT NULL AND push_off_at IS NULL",
			}),
		],
	);
}
