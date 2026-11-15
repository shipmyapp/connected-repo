/**
 * One record per device, per account: what a phone, tablet or computer is,
 * whether the app is installed on it, and whether push is on there. A device is one browser storage
 * context, one cookie jar: on Android and on computers the browser and the app
 * installed from it share it, so they are one device; on an iPhone (and Safari
 * on a Mac) the Home Screen (or Dock) app keeps its own, so the app and the
 * browser are two devices of one phone, matched here when read, never stored.
 */
import type { AppPlatform } from "../device.zod.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DevicePlatform = AppPlatform;

/** What the rules read of a device; times are epoch milliseconds. */
export interface DeviceFacts {
	platform: DevicePlatform;
	browser: string | null;
	os: string | null;
	model: string | null;
	osVersion: string | null;
	/** `"393x852@3"`: the screen in CSS pixels and its density. */
	screen: string | null;
	timeZone: string | null;
	language: string | null;
	/** This device is the installed app (Home Screen, Dock, or Chrome's app window). */
	isStandalone: boolean;
	installedAt: number | null;
	openedInstalledAt: number | null;
	hasLivePush: boolean;
	pushOffAt: number | null;
	pushOffReason: string | null;
	lastSeenAt: number;
}

/**
 * How long without opening the installed app before a device whose browser
 * keeps visiting counts as probably uninstalled, and how recent an opening of
 * an iPhone's Home Screen app must be to stand for its Safari. A working
 * figure, still open, kept in one place.
 */
export const PROBABLY_UNINSTALLED_DAYS = 30;

/** The automatic install offer on a device without the app comes back this long after it was last shown or closed. */
export const INSTALL_OFFER_EVERY_MS = 48 * 60 * 60 * 1000;

const STALE_MS = PROBABLY_UNINSTALLED_DAYS * MS_PER_DAY;

/** The browsers whose installed app keeps its own storage: an iPhone or iPad, and Safari on a Mac. */
export const needsPairing = (device: Pick<DeviceFacts, "platform" | "os" | "browser">): boolean =>
	device.platform === "ios" || (device.os === "macOS" && /Safari/.test(device.browser ?? ""));

/** `17.4.1` → `17.4`: a point release can land on Safari and the Home Screen app a day apart. */
const majorMinor = (version: string | null): string | null =>
	version?.split(".").slice(0, 2).join(".") ?? null;

/** The same phone, as far as the few signature fields can tell. */
const sameSignature = (a: DeviceFacts, b: DeviceFacts): boolean =>
	a.platform === b.platform &&
	a.model === b.model &&
	majorMinor(a.osVersion) === majorMinor(b.osVersion) &&
	a.screen !== null &&
	a.screen === b.screen &&
	a.timeZone === b.timeZone &&
	a.language === b.language;

const lastOpenedInstalled = (device: DeviceFacts): number | null =>
	device.openedInstalledAt ?? device.installedAt;

/**
 * An installed device that is probably no longer installed: its push token was
 * pruned (on an iPhone, removing the Home Screen app kills its subscription)
 * and it has not opened installed since; or it has not opened installed for
 * `PROBABLY_UNINSTALLED_DAYS` while it, or the browser it pairs with, kept
 * visiting. A device never seen installed is not "uninstalled".
 */
export function isProbablyUninstalled(
	device: DeviceFacts,
	siblings: readonly DeviceFacts[],
	now: number,
): boolean {
	const opened = lastOpenedInstalled(device);
	if (opened === null) return false;
	if (device.pushOffReason === "pruned" && device.pushOffAt !== null && opened < device.pushOffAt)
		return true;
	if (now - opened < STALE_MS) return false;
	const browsers = device.isStandalone
		? siblings.filter((other) => !other.isStandalone && sameSignature(other, device))
		: [];
	const lastVisit = Math.max(device.lastSeenAt, ...browsers.map((other) => other.lastSeenAt));
	return lastVisit - opened >= STALE_MS;
}

/**
 * The Home Screen (or Dock) apps an iPhone's Safari (or a Mac's) stands for:
 * standalone devices of the same account with the same signature. `recent`
 * keeps only those opened within the window.
 */
const pairedApps = (
	device: DeviceFacts,
	siblings: readonly DeviceFacts[],
	now: number,
	recent: boolean,
) =>
	siblings.filter((other) => {
		if (!other.isStandalone || !sameSignature(device, other)) return false;
		if (!recent) return true;
		const opened = lastOpenedInstalled(other);
		return (
			opened !== null && now - opened < STALE_MS && !isProbablyUninstalled(other, siblings, now)
		);
	});

/**
 * Whether the app is installed on the device in the person's hand. The app
 * itself always is. On Android and computers the browser and its app are one
 * device, so the device's own install counts until it is probably
 * uninstalled. An iPhone's Safari (or a Mac's) counts when exactly one Home
 * Screen app of the same account carries its signature and was opened within
 * the window; two that match (two identical iPhones on one account) match
 * nothing, so the offer shows: a tap is cheaper than a missed install.
 */
export function isInstalledHere(
	device: DeviceFacts,
	siblings: readonly DeviceFacts[],
	now: number,
): boolean {
	if (device.isStandalone) return true;
	if (device.installedAt !== null && !isProbablyUninstalled(device, siblings, now)) return true;
	if (!needsPairing(device)) return false;
	return pairedApps(device, siblings, now, true).length === 1;
}

/** Installed here once and no longer counted: the offer and the card come back on that device. */
export function wasInstalledHere(
	device: DeviceFacts,
	siblings: readonly DeviceFacts[],
	now: number,
): boolean {
	if (isInstalledHere(device, siblings, now)) return false;
	return (
		device.installedAt !== null ||
		(needsPairing(device) && pairedApps(device, siblings, now, false).length > 0)
	);
}

/** The install offer's own clock: 48 hours after it was last shown or closed on this device. */
export function isInstallOfferDue(
	tries: { lastShownAt?: number; closedAt?: number } | null | undefined,
	now: number,
): boolean {
	const last = Math.max(tries?.lastShownAt ?? 0, tries?.closedAt ?? 0);
	return now - last >= INSTALL_OFFER_EVERY_MS;
}
