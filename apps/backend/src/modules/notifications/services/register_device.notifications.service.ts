import { createHash } from "node:crypto";
import { pushOffDevice } from "@backend/modules/devices/services/push.devices.service";
import { reportDevice } from "@backend/modules/devices/services/report.devices.service";
import type { AppPlatform } from "@connected-repo/zod-schemas/device.zod";
import type { DevicePlatform } from "@connected-repo/zod-schemas/enums.zod";

/** The native/old platform names onto the three kinds of device. */
const appPlatformOf = (platform: DevicePlatform | null | undefined): AppPlatform | undefined =>
	platform === "ios" || platform === "android" ? platform : platform ? "desktop" : undefined;

/**
 * A device key for a caller with neither the device cookie nor `x-device-id`
 * (a native build that predates the header): derived from its push address,
 * stable for as long as the address is.
 */
export const tokenDeviceKey = (fcmToken: string): string =>
	`token-${createHash("sha256").update(fcmToken).digest("base64url")}`;

/**
 * `notifications.registerDevice`: the native app's (and an N-1 web app's) way
 * to register a push address, as a device report. Kept for the `/mobile-app`
 * contract; the web app reports through `devices.report`.
 */
export const registerFcmDevice = async (params: {
	userId: string;
	deviceKey: string;
	fcmToken: string;
	headers: Headers;
	platform?: DevicePlatform | null;
	pwaInstalled?: boolean;
	pwaStandaloneLaunch?: boolean;
}) => {
	const { userId, deviceKey, fcmToken, headers, platform, pwaInstalled, pwaStandaloneLaunch } =
		params;
	await reportDevice({
		userId,
		deviceKey,
		headers,
		report: {
			platform: appPlatformOf(platform),
			...(pwaStandaloneLaunch ? { isStandalone: true } : {}),
			...(pwaInstalled ? { isInstalled: true } : {}),
			pushPermission: "granted",
			fcmToken,
		},
	});
};

/** `notifications.revokeDevice`: push off for this address on this account (switched off here). */
export const revokeFcmDevice = async (params: {
	userId: string;
	deviceKey: string | null;
	fcmToken: string;
}) => pushOffDevice({ ...params, reason: "switched_off" });
