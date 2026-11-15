import { describe, expect, it } from "vitest";
import { appPlatformOf, installFormFactorOf } from "./device-env";

const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_APP =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPHONE_CHROME =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_PHONE =
	"Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const ANDROID_IN_APP =
	"Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 Instagram 300.0";
const ANDROID_TABLET =
	"Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const WINDOWS =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

describe("appPlatformOf: the kind of device", () => {
	it("tells iOS (Safari, the Home Screen app, Chrome, an iPad posing as a Mac), Android and computers apart", () => {
		for (const userAgent of [IPHONE, IPHONE_APP, IPHONE_CHROME]) {
			expect(appPlatformOf({ userAgent, platform: "iPhone", maxTouchPoints: 5 })).toBe("ios");
		}
		expect(appPlatformOf({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(
			"ios",
		);
		expect(appPlatformOf({ userAgent: IPAD_AS_MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(
			"desktop",
		);
		expect(
			appPlatformOf({ userAgent: ANDROID_PHONE, platform: "Linux armv8l", maxTouchPoints: 5 }),
		).toBe("android");
		expect(
			appPlatformOf({ userAgent: ANDROID_IN_APP, platform: "Linux armv8l", maxTouchPoints: 5 }),
		).toBe("android");
		expect(appPlatformOf({ userAgent: WINDOWS, platform: "Win32", maxTouchPoints: 0 })).toBe(
			"desktop",
		);
	});
});

describe("which device the install sheet shows the app on", () => {
	it("knows a phone", () => {
		expect(installFormFactorOf({ ua: IPHONE, maxTouchPoints: 5, shortSide: 393 })).toBe("PHONE");
		expect(installFormFactorOf({ ua: ANDROID_PHONE, maxTouchPoints: 5, shortSide: 412 })).toBe(
			"PHONE",
		);
	});

	it("knows a tablet, an iPad that says it is a Mac included", () => {
		expect(installFormFactorOf({ ua: IPAD_AS_MAC, maxTouchPoints: 5, shortSide: 820 })).toBe(
			"TABLET",
		);
		expect(installFormFactorOf({ ua: ANDROID_TABLET, maxTouchPoints: 10, shortSide: 900 })).toBe(
			"TABLET",
		);
	});

	it("knows a computer, a touch-screen laptop included", () => {
		expect(installFormFactorOf({ ua: IPAD_AS_MAC, maxTouchPoints: 0, shortSide: 900 })).toBe(
			"COMPUTER",
		);
		expect(installFormFactorOf({ ua: WINDOWS, maxTouchPoints: 10, shortSide: 1080 })).toBe(
			"COMPUTER",
		);
	});
});
