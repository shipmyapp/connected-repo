import type { InstallBlocker, InstallStep } from "@connected-repo/zod-schemas/device.zod";

/**
 * THE SEAM between the install offer and the install record.
 *
 * Today (this file): a local stand-in. The automatic offer shows at most
 * once a visit and comes back 48 hours after it was last shown or closed on
 * this browser (one localStorage key); nothing is known about installs on
 * other devices; "what happened?" is never asked.
 *
 * The per-device record on the server replaces this body
 * (`devices.here`, `devices.recordInstallTry`): an iPhone's Safari paired with
 * its own Home Screen app, the 48 hours per device, the blocker question. The
 * exported names and signatures stay; callers never change.
 */

/** The automatic install offer comes back this long after it was last shown or closed. */
export const INSTALL_OFFER_EVERY_MS = 48 * 60 * 60 * 1000;

/** Metadata of a try, used by the per-device record only for logging (no analytics). */
type InstallTryMeta = { guide?: string; via?: "offer" | "tap" };

const LAST_OFFER_KEY = "pwa.installOfferAt";
/** The template's old 3-day dismissal key, replaced by LAST_OFFER_KEY. */
const LEGACY_DISMISS_KEY = "pwa.installSheetDismissedAt";

let isShownThisVisit = false;

const readLastOffer = (): number => {
	try {
		localStorage.removeItem(LEGACY_DISMISS_KEY);
		return Number(localStorage.getItem(LAST_OFFER_KEY)) || 0;
	} catch {
		return 0;
	}
};

const writeLastOffer = (now: number) => {
	try {
		localStorage.setItem(LAST_OFFER_KEY, String(now));
	} catch {
		// Storage blocked (Safari private mode): the offer holds for this visit only.
	}
};

/**
 * Whether the automatic install offer may show now: online (the dialog is not
 * precached, so offline would only show the stand-in sheet), not yet this
 * visit, and 48 hours after it was last shown or closed here.
 */
export const mayOfferInstallNow = async (): Promise<boolean> => {
	if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
	if (isShownThisVisit) return false;
	return Date.now() - readLastOffer() >= INSTALL_OFFER_EVERY_MS;
};

/** Whether to ask "what happened?" on this iPhone now, from this device's install tries. */
export const mayAskInstallBlocker = async (): Promise<boolean> => false;

/**
 * Whether the app is installed on this very device as far as the record knows
 * (the browser cannot see an iPhone's Home Screen app). `undefined`: unknown.
 * A React hook, so the per-device record can read `devices.here` through TanStack Query.
 */
export const useInstalledHere = (): boolean | undefined => undefined;

/** The offer showed in this visit (by itself or as the blocker question). */
export const markInstallOfferShown = (): void => {
	isShownThisVisit = true;
};

/** One step of an install try on this device. */
export const reportInstallTry = (step: InstallStep, _meta: InstallTryMeta = {}): void => {
	if (step === "shown" || step === "closed") writeLastOffer(Date.now());
};

/** The person's answer to "what happened?". */
export const reportInstallBlocker = (_reason: InstallBlocker): void => undefined;

/** For tests: forget this visit. */
export const resetInstallRecordForTests = (): void => {
	isShownThisVisit = false;
};
