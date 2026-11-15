import type { AppPlatform } from "@connected-repo/zod-schemas/device.zod";

/**
 * The one detector: what kind of device this is, which browser, whether
 * this page is the installed app, and the few fields that can pair an
 * iPhone's Safari with its Home Screen app on the server (`screen`,
 * `timeZone`, `language`; the OS version and model come from the user agent
 * there).
 *
 * Push differs sharply by platform:
 * - iOS Safari: Web Push works ONLY inside the installed app (Home Screen).
 *   No browser-tab push at all, so the next ask there is "install".
 * - Android Chrome: push works in the tab and in the installed app.
 * - Desktop: push works in any modern browser.
 */

const isBrowser = typeof window !== "undefined";

type Signals = { userAgent: string; platform: string; maxTouchPoints: number };

const currentSignals = (): Signals => ({
	userAgent: isBrowser ? navigator.userAgent : "",
	platform: isBrowser ? (navigator.platform ?? "") : "",
	maxTouchPoints: isBrowser ? (navigator.maxTouchPoints ?? 0) : 0,
});

/** iPadOS 13+ says it is a Mac, but has touch. */
const isIPadAsMac = ({ platform, maxTouchPoints }: Signals) =>
	platform === "MacIntel" && maxTouchPoints > 1;

const isIOSOf = (signals: Signals) =>
	/iPad|iPhone|iPod/.test(signals.userAgent) || isIPadAsMac(signals);

/** Which kind of device this is: an iPad that says it is a Mac counts as iOS. */
export function appPlatformOf(signals: Signals): AppPlatform {
	if (isIOSOf(signals)) return "ios";
	if (/Android/.test(signals.userAgent)) return "android";
	return "desktop";
}

/** What the install sheet shows the app on: the kind of device in the person's hand. */
export type InstallFormFactor = "PHONE" | "TABLET" | "COMPUTER";

/**
 * Phones by their user agent, tablets by theirs (an iPad that reports a Mac
 * gives itself away by touch; an Android tablet has no "Mobile"), and a
 * touch screen 600 px or more on its short side counts as a tablet too.
 * Everything else is a computer.
 */
export function installFormFactorOf({
	ua,
	maxTouchPoints,
	shortSide,
}: {
	ua: string;
	maxTouchPoints: number;
	shortSide: number;
}): InstallFormFactor {
	const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
	if (isIpad) return "TABLET";
	if (/Android/.test(ua)) return /Mobile/.test(ua) ? "PHONE" : "TABLET";
	if (/iPhone|iPod|Mobile/.test(ua)) return "PHONE";
	if (maxTouchPoints > 1 && shortSide >= 600 && !/Windows NT|CrOS|Linux x86_64/.test(ua))
		return "TABLET";
	return "COMPUTER";
}

export const currentInstallFormFactor = (): InstallFormFactor =>
	isBrowser
		? installFormFactorOf({
				ua: navigator.userAgent,
				maxTouchPoints: navigator.maxTouchPoints ?? 0,
				shortSide: Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0),
			})
		: "PHONE";

/** This page is the installed app: display mode, iOS's own flag, or an Android TWA's referrer. */
const isStandalone = (): boolean => {
	if (!isBrowser) return false;
	if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
	if ((navigator as { standalone?: boolean }).standalone) return true;
	return document.referrer.includes("android-app://");
};

/** True when the runtime can, in principle, receive Web Push right now (iOS: only inside the installed app). */
const canReceivePush = (ios: boolean, standalone: boolean): boolean => {
	if (!isBrowser) return false;
	if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
		return false;
	return !(ios && !standalone);
};

/** `"393x852@3"`: the screen in CSS pixels and its density, the same in an iPhone's Safari and its Home Screen app. */
const screenSignature = (): string | undefined => {
	if (!isBrowser || !window.screen?.width) return undefined;
	const ratio = Math.round((window.devicePixelRatio || 1) * 100) / 100;
	return `${window.screen.width}x${window.screen.height}@${ratio}`;
};

interface DeviceEnv {
	platform: AppPlatform;
	isMobile: boolean;
	isIOS: boolean;
	isAndroid: boolean;
	isStandalone: boolean;
	canReceivePush: boolean;
	/** An iPhone or iPad outside the installed app: push waits for the install (one answer for every ask). */
	needsInstallForPush: boolean;
	/** The fields that pair an iPhone's Safari with its Home Screen app on the server. */
	signature: { screen?: string; timeZone?: string; language?: string };
}

export const getDeviceEnv = (): DeviceEnv => {
	const signals = currentSignals();
	const ios = isIOSOf(signals);
	const standalone = isStandalone();
	let timeZone: string | undefined;
	try {
		timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
	} catch {
		timeZone = undefined;
	}
	return {
		platform: appPlatformOf(signals),
		isMobile: /iPad|iPhone|iPod|Android/.test(signals.userAgent),
		isIOS: ios,
		isAndroid: /Android/.test(signals.userAgent),
		isStandalone: standalone,
		canReceivePush: canReceivePush(ios, standalone),
		needsInstallForPush: ios && !standalone,
		signature: {
			screen: screenSignature(),
			timeZone,
			language: isBrowser ? navigator.language || undefined : undefined,
		},
	};
};
