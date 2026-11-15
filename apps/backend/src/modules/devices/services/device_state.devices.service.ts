import { db } from "@backend/db/db";
import type {
	AppPlatform,
	DeviceHere,
	DevicePermission,
	InstallTry,
} from "@connected-repo/zod-schemas/device.zod";
import {
	type DeviceFacts,
	isInstalledHere,
	isInstallOfferDue,
	wasInstalledHere,
} from "@connected-repo/zod-schemas/devices/devices.rules";
import { shouldAskInstallBlocker } from "@connected-repo/zod-schemas/devices/install_tries.rules";

const DEVICE_COLUMNS = [
	"deviceKey",
	"platform",
	"browser",
	"os",
	"model",
	"osVersion",
	"screen",
	"timeZone",
	"language",
	"isStandalone",
	"installedAt",
	"openedInstalledAt",
	"pushPermission",
	"fcmToken",
	"pushOffAt",
	"pushOffReason",
	"installTries",
	"lastSeenAt",
] as const;

/** A device row as the rules read it. */
interface DeviceRow {
	userId: string;
	deviceKey: string;
	platform: AppPlatform;
	browser: string | null;
	os: string | null;
	model: string | null;
	osVersion: string | null;
	screen: string | null;
	timeZone: string | null;
	language: string | null;
	isStandalone: boolean;
	installedAt: number | null;
	openedInstalledAt: number | null;
	pushPermission: DevicePermission | null;
	fcmToken: string | null;
	pushOffAt: number | null;
	pushOffReason: string | null;
	installTries: InstallTry | null;
	lastSeenAt: number;
}

/** Every device of one account, or of several (a future admin summary). */
const devicesOf = async (userIds: string[]): Promise<DeviceRow[]> =>
	db.devices.where({ userId: { in: userIds } }).select("userId", ...DEVICE_COLUMNS);

/** A row as the rules read it. */
const factsOf = (row: DeviceRow): DeviceFacts => ({
	...row,
	hasLivePush: row.fcmToken !== null && row.pushOffAt === null,
});

/** Nothing known about the device in the hand (no key, no report yet): nothing is taken as installed or on. */
const UNKNOWN: DeviceHere = {
	known: false,
	platform: null,
	browser: null,
	model: null,
	os: null,
	isStandalone: false,
	installedHere: false,
	probablyUninstalled: false,
	pushHere: false,
	pushPermission: null,
	installTries: null,
	installOfferDue: true,
	askInstallBlocker: false,
};

/**
 * What the device in the person's hand may be offered: the app installed here
 * (an iPhone's Safari paired with its Home Screen app, read from the account's
 * other devices), installed once and no longer counted, push on here for this
 * account, whether the install offer is due (48 hours after it was last shown
 * or closed here) and whether "what happened?" should be asked (an iPhone
 * outside the app). Rules: @connected-repo/zod-schemas/devices/*.rules.
 */
export const deviceStateFor = async (
	userId: string,
	deviceKey: string | null,
	now = Date.now(),
): Promise<DeviceHere> => {
	if (!deviceKey) return UNKNOWN;
	const rows = await devicesOf([userId]);
	const row = rows.find((candidate) => candidate.deviceKey === deviceKey);
	if (!row) return UNKNOWN;
	const device = factsOf(row);
	const siblings = rows.filter((other) => other !== row).map(factsOf);
	const installedHere = isInstalledHere(device, siblings, now);
	const tries = row.installTries ?? undefined;
	return {
		known: true,
		platform: row.platform,
		browser: row.browser,
		model: row.model,
		os: row.os,
		isStandalone: row.isStandalone,
		installedHere,
		probablyUninstalled: wasInstalledHere(device, siblings, now),
		pushHere: device.hasLivePush,
		pushPermission: row.pushPermission,
		installTries: row.installTries,
		installOfferDue: !installedHere && isInstallOfferDue(tries, now),
		askInstallBlocker:
			row.platform === "ios" && !installedHere && shouldAskInstallBlocker(tries, undefined, now),
	};
};
