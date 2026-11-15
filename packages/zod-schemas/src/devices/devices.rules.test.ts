import { describe, expect, it } from "vitest";
import {
	type DeviceFacts,
	INSTALL_OFFER_EVERY_MS,
	isInstalledHere,
	isInstallOfferDue,
	isProbablyUninstalled,
	PROBABLY_UNINSTALLED_DAYS,
	wasInstalledHere,
} from "./devices.rules";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const NOW = 1_800_000_000_000;
const DAY = MS_PER_DAY;

const device = (facts: Partial<DeviceFacts> = {}): DeviceFacts => ({
	platform: "ios",
	browser: "Mobile Safari",
	os: "iOS",
	model: "iPhone",
	osVersion: "17.4.1",
	screen: "393x852@3",
	timeZone: "Asia/Kolkata",
	language: "en-IN",
	isStandalone: false,
	installedAt: null,
	openedInstalledAt: null,
	hasLivePush: false,
	pushOffAt: null,
	pushOffReason: null,
	lastSeenAt: NOW,
	...facts,
});

const homeScreenApp = (facts: Partial<DeviceFacts> = {}) =>
	device({
		browser: "WebKit",
		isStandalone: true,
		installedAt: NOW - 10 * DAY,
		openedInstalledAt: NOW - DAY,
		...facts,
	});

describe("isInstalledHere", () => {
	it("the installed app itself is always installed here", () => {
		expect(isInstalledHere(homeScreenApp(), [], NOW)).toBe(true);
	});

	it("an iPhone's Safari counts its own Home Screen app, opened lately", () => {
		const safari = device();
		expect(isInstalledHere(safari, [homeScreenApp()], NOW)).toBe(true);
	});

	it("matches across a point release of iOS", () => {
		expect(
			isInstalledHere(device({ osVersion: "17.4" }), [homeScreenApp({ osVersion: "17.4.1" })], NOW),
		).toBe(true);
	});

	it("two identical iPhones on one account match nothing: the offer shows", () => {
		expect(isInstalledHere(device(), [homeScreenApp(), homeScreenApp()], NOW)).toBe(false);
	});

	it("an iPad beside an iPhone is another device", () => {
		const ipad = device({ model: "iPad", screen: "820x1180@2" });
		expect(isInstalledHere(ipad, [homeScreenApp()], NOW)).toBe(false);
	});

	it("a phone in another time zone or language is another phone", () => {
		expect(isInstalledHere(device({ timeZone: "Europe/London" }), [homeScreenApp()], NOW)).toBe(
			false,
		);
		expect(isInstalledHere(device({ language: "hi-IN" }), [homeScreenApp()], NOW)).toBe(false);
	});

	it("a Home Screen app not opened for the window no longer stands for Safari", () => {
		const stale = homeScreenApp({ openedInstalledAt: NOW - (PROBABLY_UNINSTALLED_DAYS + 1) * DAY });
		expect(isInstalledHere(device(), [stale], NOW)).toBe(false);
		expect(wasInstalledHere(device(), [stale], NOW)).toBe(true);
	});

	it("Android and computers need no pairing: the device's own install counts", () => {
		const android = device({
			platform: "android",
			os: "Android",
			browser: "Mobile Chrome",
			model: "Pixel 7",
			installedAt: NOW - DAY,
		});
		expect(isInstalledHere(android, [], NOW)).toBe(true);
		const chrome = device({
			platform: "android",
			os: "Android",
			browser: "Mobile Chrome",
			model: "Pixel 7",
		});
		expect(
			isInstalledHere(
				chrome,
				[homeScreenApp({ platform: "android", model: "Pixel 7", os: "Android" })],
				NOW,
			),
		).toBe(false);
	});

	it("Safari on a Mac pairs with its Dock app", () => {
		const mac = {
			platform: "desktop" as const,
			os: "macOS",
			model: "Macintosh",
			osVersion: "10.15.7",
			screen: "1512x982@2",
		};
		const safari = device({ ...mac, browser: "Safari" });
		expect(isInstalledHere(safari, [homeScreenApp({ ...mac })], NOW)).toBe(true);
		const chromeOnMac = device({ ...mac, browser: "Chrome" });
		expect(isInstalledHere(chromeOnMac, [homeScreenApp({ ...mac })], NOW)).toBe(false);
	});

	it("never matches without a screen", () => {
		expect(isInstalledHere(device({ screen: null }), [homeScreenApp({ screen: null })], NOW)).toBe(
			false,
		);
	});
});

describe("isProbablyUninstalled", () => {
	it("a pruned push token on an installed app not opened since", () => {
		const app = homeScreenApp({
			openedInstalledAt: NOW - 3 * DAY,
			pushOffAt: NOW - DAY,
			pushOffReason: "pruned",
		});
		expect(isProbablyUninstalled(app, [], NOW)).toBe(true);
		expect(isInstalledHere(device(), [app], NOW)).toBe(false);
	});

	it("not when the app opened after the token was pruned", () => {
		const app = homeScreenApp({
			openedInstalledAt: NOW - DAY,
			pushOffAt: NOW - 3 * DAY,
			pushOffReason: "pruned",
		});
		expect(isProbablyUninstalled(app, [], NOW)).toBe(false);
	});

	it("a month without opening while the browser keeps visiting", () => {
		const opened = NOW - 40 * DAY;
		const app = homeScreenApp({ openedInstalledAt: opened, lastSeenAt: opened });
		expect(isProbablyUninstalled(app, [device({ lastSeenAt: NOW })], NOW)).toBe(true);
		// Nobody visited at all: an idle person, not an uninstall.
		expect(isProbablyUninstalled(app, [device({ lastSeenAt: opened })], NOW)).toBe(false);
	});

	it("an Android install not opened for a month while the same device keeps visiting in Chrome", () => {
		const android = device({
			platform: "android",
			os: "Android",
			installedAt: NOW - 60 * DAY,
			openedInstalledAt: NOW - 45 * DAY,
		});
		expect(isProbablyUninstalled(android, [], NOW)).toBe(true);
		expect(isInstalledHere(android, [], NOW)).toBe(false);
	});

	it("a device never seen installed is not uninstalled", () => {
		expect(isProbablyUninstalled(device(), [], NOW)).toBe(false);
	});
});

describe("isInstallOfferDue", () => {
	it("comes back 48 hours after it was last shown or closed", () => {
		expect(isInstallOfferDue(undefined, NOW)).toBe(true);
		expect(isInstallOfferDue({ lastShownAt: NOW - INSTALL_OFFER_EVERY_MS + 1 }, NOW)).toBe(false);
		expect(isInstallOfferDue({ lastShownAt: NOW - INSTALL_OFFER_EVERY_MS }, NOW)).toBe(true);
		expect(isInstallOfferDue({ lastShownAt: NOW - 3 * DAY, closedAt: NOW - DAY }, NOW)).toBe(false);
	});
});
