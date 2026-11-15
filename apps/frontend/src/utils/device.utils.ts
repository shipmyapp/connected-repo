import type { DevicePlatform } from "@connected-repo/zod-schemas/enums.zod";

/**
 * Device platform + PWA state detection.
 *
 * Push notification availability differs sharply by platform:
 * - iOS Safari: Web Push works ONLY inside an installed PWA (home-screen).
 *   No browser-tab push at all. If we detect iOS + not standalone, the
 *   correct next prompt is "install to home screen" — asking for notif
 *   permission first is wasted (there's no delivery path).
 * - Android Chrome: Push works in browser tab AND in installed PWA.
 *   Installed = better UX (icon, own window) but not required.
 * - Desktop: Push works in any modern browser. Installed = own window.
 *
 * These helpers borrow from magicbell/pwa-inbox/src/lib/device.ts and the
 * detection pattern used by @khmyznikov/pwa-install internally.
 */

const isBrowser = typeof window !== "undefined";

const isMobile = (): boolean => {
	if (!isBrowser) return false;
	return /iPad|iPhone|iPod|Android/.test(navigator.userAgent);
};

const isIOS = (): boolean => {
	if (!isBrowser) return false;
	// iPadOS 13+ masquerades as Mac in UA but exposes touch — the multi-touch
	// check catches iPads pretending to be MacBooks.
	const iPadOSMasquerade = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
	return /iPad|iPhone|iPod/.test(navigator.userAgent) || iPadOSMasquerade;
};

const isAndroid = (): boolean => {
	if (!isBrowser) return false;
	return /Android/.test(navigator.userAgent);
};

const isStandalone = (): boolean => {
	if (!isBrowser) return false;
	if (window.matchMedia("(display-mode: standalone)").matches) return true;
	// Legacy iOS Safari path — sets navigator.standalone on the installed PWA.
	if ((navigator as { standalone?: boolean }).standalone) return true;
	// Android TWA (Trusted Web Activity) sets this referrer.
	if (document.referrer.includes("android-app://")) return true;
	return false;
};

/**
 * True iff the runtime can, in principle, receive Web Push right now.
 * Combines API availability with iOS's PWA-only constraint.
 */
const canReceivePush = (): boolean => {
	if (!isBrowser) return false;
	if (!("serviceWorker" in navigator)) return false;
	if (!("PushManager" in window)) return false;
	if (!("Notification" in window)) return false;
	// iOS: only inside installed PWA. If they're in Safari-tab, no.
	if (isIOS() && !isStandalone()) return false;
	return true;
};

/**
 * Broad-strokes platform bucket sent to the backend at push-register time.
 * Uses `navigator.userAgent` heuristics — good enough for analytics, not
 * a security control. Falls through to "other" for anything unrecognized.
 */
const getPlatform = (): DevicePlatform => {
	if (!isBrowser) return "other";
	const ua = navigator.userAgent;
	if (isIOS()) return "ios";
	if (isAndroid()) return "android";
	if (/Macintosh|Mac OS X/.test(ua)) return "macos";
	if (/Windows/.test(ua)) return "windows";
	if (/CrOS/.test(ua)) return "chromeos";
	if (/Linux/.test(ua)) return "linux";
	return "other";
};

interface DeviceEnv {
	platform: DevicePlatform;
	isMobile: boolean;
	isIOS: boolean;
	isAndroid: boolean;
	isStandalone: boolean;
	canReceivePush: boolean;
}

export const getDeviceEnv = (): DeviceEnv => ({
	platform: getPlatform(),
	isMobile: isMobile(),
	isIOS: isIOS(),
	isAndroid: isAndroid(),
	isStandalone: isStandalone(),
	canReceivePush: canReceivePush(),
});
