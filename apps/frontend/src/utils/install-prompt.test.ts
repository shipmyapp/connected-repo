import { describe, expect, it } from "vitest";
import { installGuideFor, isAndroidChrome, usesInstallDialog } from "./install-prompt";

const IPHONE_SAFARI =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0";
const ANDROID_SAMSUNG =
	"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36";
const ANDROID_CHROME =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36";
const IPAD_AS_MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

const guide = (userAgent: string, extra: Partial<Parameters<typeof installGuideFor>[0]> = {}) =>
	installGuideFor({
		userAgent,
		maxTouchPoints: 0,
		platform: "",
		hasNativePrompt: false,
		isStandalone: false,
		...extra,
	});

describe("installGuideFor", () => {
	it("uses the browser's own dialog whenever it offered one", () => {
		expect(guide(ANDROID_CHROME, { hasNativePrompt: true })).toBe("NATIVE");
	});
	it("sends Samsung Internet to Chrome, whose install Play Protect does not block", () => {
		expect(guide(ANDROID_SAMSUNG, { hasNativePrompt: true })).toBe("USE_CHROME");
		expect(guide(ANDROID_SAMSUNG)).toBe("USE_CHROME");
	});
	it("installs on Android from Chrome only: every other browser is sent there", () => {
		const edge =
			"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 EdgA/131.0";
		const firefox = "Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0";
		expect(guide(edge, { hasNativePrompt: true })).toBe("USE_CHROME");
		expect(guide(firefox)).toBe("USE_CHROME");
		expect(isAndroidChrome(ANDROID_CHROME)).toBe(true);
		expect(isAndroidChrome(ANDROID_SAMSUNG)).toBe(false);
	});
	it("offers nothing once installed, except asking an app installed from another Android browser to move to Chrome", () => {
		expect(guide(IPHONE_SAFARI, { isStandalone: true })).toBe("NONE");
		expect(guide(ANDROID_CHROME, { isStandalone: true })).toBe("NONE");
		expect(guide(ANDROID_SAMSUNG, { isStandalone: true })).toBe("REINSTALL_IN_CHROME");
	});
	it("tells an iPhone the Share-menu steps for its browser", () => {
		expect(guide(IPHONE_SAFARI)).toBe("IOS_SAFARI");
		expect(guide(IPHONE_CHROME)).toBe("IOS_OTHER_BROWSER");
		expect(guide(IPAD_AS_MAC, { platform: "MacIntel", maxTouchPoints: 5 })).toBe("IOS_SAFARI");
	});
	it("sends an in-app browser out to the phone's browser first, to Safari on an iPhone", () => {
		expect(guide(IPHONE_INSTAGRAM)).toBe("IOS_IN_APP");
		expect(guide(ANDROID_WEBVIEW)).toBe("IN_APP_BROWSER");
	});
	it("adds to the Dock from Safari 17 or later on a Mac, and nowhere else on a Mac", () => {
		expect(guide(IPAD_AS_MAC)).toBe("MAC_SAFARI");
		expect(guide(IPAD_AS_MAC.replace("Version/18.1", "Version/16.6"))).toBe("DESKTOP_MENU");
		const macChrome =
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
		expect(guide(macChrome)).toBe("DESKTOP_MENU");
	});
	it("points Android and desktop at the browser's menu when there is no dialog", () => {
		expect(guide(ANDROID_CHROME)).toBe("ANDROID_MENU");
		expect(guide("Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0")).toBe("DESKTOP_MENU");
	});
});

describe("usesInstallDialog", () => {
	it("gives the install dialog Apple's steps, an iPhone's in-app browsers and the browser's own dialog", () => {
		for (const covered of [
			"NATIVE",
			"IOS_SAFARI",
			"IOS_OTHER_BROWSER",
			"IOS_IN_APP",
			"MAC_SAFARI",
		] as const) {
			expect(usesInstallDialog(covered)).toBe(true);
		}
	});
	it("keeps Android's move to Chrome, other in-app browsers and the menus on the app's own sheet", () => {
		for (const own of [
			"USE_CHROME",
			"REINSTALL_IN_CHROME",
			"IN_APP_BROWSER",
			"ANDROID_MENU",
			"DESKTOP_MENU",
			"NONE",
		] as const) {
			expect(usesInstallDialog(own)).toBe(false);
		}
	});
});
