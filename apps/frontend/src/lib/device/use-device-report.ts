import type { DevicePermission, DeviceReportInput } from "@connected-repo/zod-schemas/device.zod";
import { getInstallSnapshot, subscribeInstall } from "@frontend/utils/install-prompt";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { useEffect, useSyncExternalStore } from "react";
import { getDeviceEnv } from "./device-env";
import { refreshDeviceHere } from "./use-device-here";

/** Back at the front after this long, the device reports again. */
const REPORT_AGAIN_AFTER_MS = 60 * 60 * 1000;

/** Push as the browser holds it: "default" is not asked yet. */
const pushPermission = (): DevicePermission => {
	if (typeof Notification === "undefined") return "unsupported";
	return Notification.permission === "default" ? "prompt" : Notification.permission;
};

/** What this visit last told the server, so the same report is not sent twice (memory only). */
let lastSent: { key: string; at: number } | null = null;

/**
 * What this device is and can do, told to the server: the kind of device,
 * whether this page is the installed app, whether the browser knows it is
 * installed, the pairing signature, push permission, and the push address
 * when there is one. The same report is sent once a visit unless `force`, or
 * an hour has passed; nothing is kept on the device (no Dexie, no
 * localStorage). Offline it is not sent (and not queued): the `online` handler
 * below reports on reconnect. Throws when the server refuses, so turning push
 * on can say so.
 */
export async function reportDevice(
	extra: Partial<DeviceReportInput> = {},
	{ force = false } = {},
): Promise<void> {
	if (typeof navigator !== "undefined" && navigator.onLine === false) return;
	const env = getDeviceEnv();
	const report: DeviceReportInput = {
		platform: env.platform,
		isStandalone: env.isStandalone,
		...(getInstallSnapshot().isInstalled ? { isInstalled: true } : {}),
		...env.signature,
		pushPermission: pushPermission(),
		...extra,
	};
	const key = JSON.stringify(report);
	const now = Date.now();
	if (!force && lastSent?.key === key && now - lastSent.at < REPORT_AGAIN_AFTER_MS) return;
	lastSent = { key, at: now };
	try {
		await orpcFetch.devices.report(report);
	} catch (error) {
		lastSent = null;
		throw error;
	}
	void refreshDeviceHere();
}

/** Kept on the device before the device record only to stop repeat reports or prompts; the server and the asks own them now. */
const forgetOldCaches = () => {
	try {
		for (const key of [
			"push.fcmToken",
			"push.fcmTokenRegisteredAt",
			"push.bannerDismissed",
			"push.initialPromptShown",
			"pwa.installOfferAt",
			"pwa.installSheetDismissedAt",
		]) {
			localStorage.removeItem(key);
		}
	} catch {
		// Storage blocked: there is nothing to forget.
	}
};

const reportQuietly = () => void reportDevice().catch(() => undefined);

/**
 * In `WorkspaceProvider`, signed in: reports the device on start, when the app
 * comes back to the front after an hour, when a permission changes, when the
 * connection comes back, and when the browser learns the app was installed.
 * Quiet on failure.
 */
export function useDeviceReport(userId: string | null) {
	const { isInstalled } = useSyncExternalStore(
		subscribeInstall,
		getInstallSnapshot,
		getInstallSnapshot,
	);

	useEffect(() => {
		if (!userId) return;
		let isLive = true;
		lastSent = null;
		forgetOldCaches();
		reportQuietly();
		const onVisible = () => {
			if (document.visibilityState === "visible") reportQuietly();
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("online", reportQuietly);
		const watched: Array<{ status: PermissionStatus; onChange: () => void }> = [];
		navigator.permissions
			?.query({ name: "notifications" })
			.then((status) => {
				if (!isLive) return;
				const onChange = () => reportQuietly();
				status.addEventListener("change", onChange);
				watched.push({ status, onChange });
			})
			.catch(() => undefined);
		return () => {
			isLive = false;
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("online", reportQuietly);
			for (const { status, onChange } of watched) status.removeEventListener("change", onChange);
		};
	}, [userId]);

	// The browser has just learnt the app is installed here (Chrome's `appinstalled`, related apps).
	useEffect(() => {
		if (userId && isInstalled && !getDeviceEnv().isStandalone) reportQuietly();
	}, [userId, isInstalled]);
}
