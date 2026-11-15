import type { InstallBlocker, InstallStep } from "@connected-repo/zod-schemas/device.zod";
import { useAsksStore } from "@frontend/lib/asks/asks.store";
import { getDeviceEnv } from "@frontend/lib/device/device-env";
import {
	fetchDeviceHere,
	refreshDeviceHere,
	useDeviceHere,
} from "@frontend/lib/device/use-device-here";
import { orpcFetch } from "@frontend/utils/orpc.client";

/**
 * THE SEAM between the install offer and the install record, filled by the
 * per-device record on the server: `devices.here` decides (an
 * iPhone's Safari paired with its own Home Screen app; 48 hours after the offer
 * was last shown or closed on THIS device, `INSTALL_OFFER_EVERY_MS` in
 * `@connected-repo/zod-schemas/devices/devices.rules`; "what happened?" on an
 * iPhone an hour after the steps), `devices.recordInstallTry` remembers.
 * Signed out there is no account to tell: the call fails quietly and nothing
 * is kept.
 */

/** Metadata of a try, kept for callers; the server records only the step. */
type InstallTryMeta = { guide?: string; via?: "offer" | "tap" };

const tell = (input: { step: InstallStep } | { step: "answered"; reason: InstallBlocker }) =>
	void orpcFetch.devices
		.recordInstallTry(input)
		.then(() => refreshDeviceHere())
		.catch(() => undefined);

/**
 * Whether the automatic install offer may show now: online, not yet this
 * visit, never where the app is installed here, otherwise when the server says
 * it is due on this device. Unknown device (signed out, no report yet): once a visit.
 */
export const mayOfferInstallNow = async (): Promise<boolean> => {
	if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
	if (useAsksStore.getState().shownThisVisit.install) return false;
	const here = await fetchDeviceHere();
	if (!here) return true;
	return !here.installedHere && here.installOfferDue;
};

/** Whether to ask "what happened?" on this iPhone now, from this device's own tries. */
export const mayAskInstallBlocker = async (): Promise<boolean> => {
	if (getDeviceEnv().platform !== "ios") return false;
	return (await fetchDeviceHere())?.askInstallBlocker === true;
};

/** Installed on this very device as the server knows it; `undefined` while unknown. */
export const useInstalledHere = (): boolean | undefined => useDeviceHere().data?.installedHere;

export const markInstallOfferShown = (): void => useAsksStore.getState().markShown("install");

export const reportInstallTry = (step: InstallStep, _meta: InstallTryMeta = {}): void =>
	tell({ step });

export const reportInstallBlocker = (reason: InstallBlocker): void =>
	tell({ step: "answered", reason });

/** For tests: forget this visit. */
export const resetInstallRecordForTests = (): void => useAsksStore.getState().reset();
