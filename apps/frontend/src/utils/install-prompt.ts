/**
 * The browser's install offer, caught from the first moment the page runs.
 *
 * Chromium fires `beforeinstallprompt` once, early, and only to listeners
 * that already exist; the event's `prompt()` is the one way to show its
 * install dialog. Imported at the top of `main.tsx` so the listener is in
 * place before anything renders. Safari and the in-app browsers never fire
 * it: there the app can only tell the person which taps to make
 * (`installGuideFor`).
 */

import { getDeviceEnv } from "@frontend/lib/device/device-env";

// `BeforeInstallPromptEvent` is the global type from @types/dom-chromium-installation-events.

/** Which taps install the app here; NONE once it is installed. */
export type InstallGuide =
	| "NATIVE"
	| "IOS_SAFARI"
	| "IOS_OTHER_BROWSER"
	/** An app's own browser on an iPhone or iPad (Instagram, Facebook, LinkedIn…): out to Safari first. */
	| "IOS_IN_APP"
	/** Safari 17 or later on a Mac: File, then Add to Dock. */
	| "MAC_SAFARI"
	| "IN_APP_BROWSER"
	| "USE_CHROME"
	| "REINSTALL_IN_CHROME"
	| "ANDROID_MENU"
	| "DESKTOP_MENU"
	| "NONE";

type InstallSnapshot = {
	/** Read by no one directly: its change is what re-renders the install UI when Chrome's offer arrives or is used. */
	hasNativePrompt: boolean;
	isStandalone: boolean;
	isGuideOpen: boolean;
	/** Installed on this device, even while this page runs in the browser. */
	isInstalled: boolean;
	/** The person accepted the browser's dialog and it has not finished yet. */
	isInstalling: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let isGuideOpen = false;
let isInstalling = false;
let installingTimer: number | undefined;
/** Chrome normally reports `appinstalled` within seconds; past this, stop saying it is installing. */
const INSTALLING_MAX_MS = 60_000;
/** The browser said so in this visit; across visits the install record knows (`components/pwa/install-record.ts`). */
let isKnownInstalled = false;
const listeners = new Set<() => void>();

/** The same answer as `getDeviceEnv().isStandalone` (display mode, iOS's flag, an Android TWA's referrer). */
const readStandalone = (): boolean =>
	typeof window === "undefined" ? false : getDeviceEnv().isStandalone;

let snapshot: InstallSnapshot = {
	hasNativePrompt: false,
	isStandalone: readStandalone(),
	isGuideOpen: false,
	isInstalled: readStandalone() || isKnownInstalled,
	isInstalling: false,
};

const emit = () => {
	const isStandalone = readStandalone();
	snapshot = {
		hasNativePrompt: deferred !== null,
		isStandalone,
		isGuideOpen,
		isInstalled: isStandalone || isKnownInstalled,
		isInstalling,
	};
	for (const listener of listeners) listener();
};

if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", (event) => {
		// Keep Chrome's own mini-infobar away; the app offers install itself.
		event.preventDefault();
		deferred = event;
		emit();
	});
	window.addEventListener("appinstalled", () => {
		deferred = null;
		isGuideOpen = false;
		isInstalling = false;
		window.clearTimeout(installingTimer);
		isKnownInstalled = true;
		emit();
	});
	// Chromium can say whether this app is installed (the manifest names itself).
	const related = (navigator as { getInstalledRelatedApps?: () => Promise<unknown[]> })
		.getInstalledRelatedApps;
	if (related) {
		void related
			.call(navigator)
			.then((apps) => {
				if (apps.length === 0) return;
				isKnownInstalled = true;
				emit();
			})
			.catch(() => undefined);
	}
	window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", emit);
}

/** Accepted in the browser's dialog: "installing" until it reports done, or a minute passes. */
const startInstalling = () => {
	isInstalling = true;
	window.clearTimeout(installingTimer);
	installingTimer = window.setTimeout(() => {
		isInstalling = false;
		emit();
	}, INSTALLING_MAX_MS);
};

export const subscribeInstall = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

export const getInstallSnapshot = (): InstallSnapshot => snapshot;

/**
 * Blurs whatever has focus before the install sheet opens: the sheet hides
 * #root from assistive technology, and a focused button or field left inside
 * it is what the browser warns about ("Blocked aria-hidden").
 */
export const releaseFocus = () => {
	const active = document.activeElement;
	if (active instanceof HTMLElement) active.blur();
};

export const setInstallGuideOpen = (isOpen: boolean) => {
	if (isOpen) releaseFocus();
	isGuideOpen = isOpen;
	emit();
};

/**
 * Google Chrome itself on Android, not another browser that carries
 * "Chrome/" in its name (Samsung Internet, Edge, Opera, Yandex, the old
 * stock browser, an app's web view).
 */
export const isAndroidChrome = (ua: string): boolean =>
	/Android/.test(ua) &&
	/Chrome\/\d/.test(ua) &&
	!/SamsungBrowser|EdgA|OPR\/|Opera|YaBrowser|UCBrowser|MiuiBrowser|HeyTapBrowser|VivoBrowser|DuckDuckGo|Firefox|; wv\)|Version\/\d/.test(
		ua,
	);

/** Safari itself on a Mac, at 17 or later (Add to Dock), never Chrome, Edge or Firefox there. */
const isMacSafariWithDock = (ua: string): boolean => {
	if (!/Macintosh/.test(ua) || /Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua)) return false;
	const version = /Version\/(\d+)[\d.]* Safari/.exec(ua)?.[1];
	return version !== undefined && Number(version) >= 17;
};

/**
 * The guides the install dialog (`<pwa-install>`) shows: the browser's own
 * dialog where there is one, and Apple's Share-menu and Add-to-Dock walk-through, which it draws
 * as Apple does. The app's own sheet keeps Android's move to Chrome, the
 * in-app browsers outside Apple, and the menus of the browsers neither covers.
 */
export const usesInstallDialog = (guide: InstallGuide): boolean =>
	guide === "NATIVE" ||
	guide === "IOS_SAFARI" ||
	guide === "IOS_OTHER_BROWSER" ||
	guide === "IOS_IN_APP" ||
	guide === "MAC_SAFARI";

/** Pure: which guide a user agent gets, so it can be tested without a browser. */
export function installGuideFor(input: {
	userAgent: string;
	maxTouchPoints: number;
	platform: string;
	hasNativePrompt: boolean;
	isStandalone: boolean;
}): InstallGuide {
	const ua = input.userAgent;
	const isAndroid = /Android/.test(ua);
	// On Android the app is installed from Chrome only: another browser's install
	// is often a package Google Play Protect blocks, and lacks Chrome's push and phone book. An app
	// already installed from one is asked, each time it opens, to move to Chrome.
	if (input.isStandalone) return isAndroid && !isAndroidChrome(ua) ? "REINSTALL_IN_CHROME" : "NONE";
	const isInApp = /FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|; wv\)/.test(ua);
	if (isAndroid && !isInApp && !isAndroidChrome(ua)) return "USE_CHROME";
	if (input.hasNativePrompt) return "NATIVE";
	const isIPadAsMac = input.platform === "MacIntel" && input.maxTouchPoints > 1;
	const isAppleMobile = /iPad|iPhone|iPod/.test(ua) || isIPadAsMac;
	if (isInApp) return isAppleMobile ? "IOS_IN_APP" : "IN_APP_BROWSER";
	if (isAppleMobile)
		return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "IOS_OTHER_BROWSER" : "IOS_SAFARI";
	if (/Android/.test(ua)) return "ANDROID_MENU";
	if (isMacSafariWithDock(ua)) return "MAC_SAFARI";
	return "DESKTOP_MENU";
}

export const currentInstallGuide = (): InstallGuide =>
	typeof navigator === "undefined"
		? "NONE"
		: installGuideFor({
				userAgent: navigator.userAgent,
				maxTouchPoints: navigator.maxTouchPoints ?? 0,
				platform: navigator.platform ?? "",
				hasNativePrompt: deferred !== null,
				isStandalone: readStandalone(),
			});

/**
 * Shows the browser's dialog when it offered one; otherwise opens the guide.
 * A prompt can be used once, so it is dropped whatever the answer.
 */
export async function requestInstall(): Promise<"accepted" | "dismissed" | "guide"> {
	const event = deferred;
	if (!event) {
		setInstallGuideOpen(true);
		return "guide";
	}
	deferred = null;
	emit();
	await event.prompt();
	const choice = await event.userChoice;
	if (choice.outcome === "accepted" && !isKnownInstalled) {
		startInstalling();
		emit();
	}
	return choice.outcome;
}

/** The browser's install offer as caught, for the install dialog to use; null once used or never offered. */
export const nativePrompt = (): BeforeInstallPromptEvent | null => deferred;

/**
 * The install dialog used the browser's offer (a prompt can be used once) and the person answered:
 * forget it, and while an accepted install finishes, say it is installing, as `requestInstall` does.
 */
export const noteNativeAnswer = (outcome: "accepted" | "dismissed") => {
	deferred = null;
	if (outcome === "accepted" && !isKnownInstalled) startInstalling();
	emit();
};

/** This page in Chrome, from another Android browser: `intent://host/path#Intent;scheme=https;package=…`. */
export const chromeIntentUrl = () => {
	const { host, pathname, search } = window.location;
	return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
};
