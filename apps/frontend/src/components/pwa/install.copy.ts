import type { InstallBlocker } from "@connected-repo/zod-schemas/device.zod";
import type { InstallGuide } from "@frontend/utils/install-prompt";

type Step = { id: string; text: string; strong: string; after?: string };

/**
 * Every word of the install offer, the dialog, the blocker sheet and the
 * profile's Install card. The sheets and the card take the app's name and icon
 * from the team's brand (`useTenant().brand`); the dialog takes them from the
 * manifest the page links (a team's own on its host). `appName` and
 * `description` are fallbacks only. Rename `appName` with the app
 * (index.html <title>, vite.config.ts manifest.name).
 */
export const INSTALL_COPY = {
	appName: "OneQ",
	/** The sheet's and the card's heading, with the app's name (a team's own on its host). */
	title: (appName: string) => `Install ${appName}`,
	moveTitle: (appName: string) => `Install ${appName} from Chrome`,
	screensLabel: "What the app does for you",
	/** Beside the logo in the dialog and the sheet: what the app is, at most two lines (the dialog clips a third). */
	description: "Your journal, with a prompt each day and reminders when you want them.",
	/** The dialog's line above its buttons (`install-description`). */
	dialogLine: "Install it to get your reminders and to write even when you are offline.",
	dialogLineIos:
		"Add it to your Home Screen to get your reminders and to write even when you are offline.",
	dialogLineIosInApp:
		"Open this page in Safari, then add it to your Home Screen to get your reminders.",
	dialogLineMac: "Add it to your Dock to open it like any other app.",
	/** The install button everywhere: the dialog's (the library's "Add to Home Screen" / "Install" are relabelled) and the sheet's. */
	install: "Install App",
	gotIt: "Got it",
	notNow: "Not now",
	copyLink: "Copy link",
	openInChrome: "Open in Chrome",
	linkCopied: "Link copied. Paste it in Safari or Chrome.",
	failed: "Couldn't open the install dialog. Try your browser's menu.",
	installing: "Installing the app…",
	installed: "Installed. Open it from your home screen.",
	cardLine: "Open it in one tap from your home screen, get your reminders, and write offline.",
	features: [
		"Works offline: write even without a connection.",
		"Opens in one tap, in its own window.",
		"Reminders at the times you choose.",
	],
	intro: {
		NATIVE: "",
		IOS_SAFARI: "Add it to your Home Screen in three taps, to get your reminders:",
		IOS_OTHER_BROWSER: "Add it to your Home Screen in three taps, to get your reminders:",
		IOS_IN_APP: "This screen can't add apps. Open the page in Safari first:",
		MAC_SAFARI: "Add it to your Dock in two clicks:",
		IN_APP_BROWSER: "This screen can't install apps. Open the link in your phone's browser first:",
		USE_CHROME:
			"Install it from Chrome so notifications work. Other browsers often block the install.",
		REINSTALL_IN_CHROME:
			"This copy came from another browser, so notifications may not work. Install it from Chrome instead:",
		ANDROID_MENU: "Install it from your browser's menu:",
		DESKTOP_MENU: "Install it from your browser:",
		NONE: "",
	} satisfies Record<InstallGuide, string>,
	steps: {
		NATIVE: [],
		IOS_SAFARI: [
			{
				id: "share",
				text: "Tap",
				strong: "Share",
				after: "(the square with an arrow, at the bottom).",
			},
			{ id: "add", text: "Scroll and tap", strong: "Add to Home Screen." },
			{ id: "confirm", text: "Tap", strong: "Add", after: "at the top right." },
		],
		IOS_OTHER_BROWSER: [
			{ id: "share", text: "Tap", strong: "Share", after: "in the address bar." },
			{ id: "add", text: "Tap", strong: "Add to Home Screen." },
			{ id: "confirm", text: "Tap", strong: "Add." },
		],
		IOS_IN_APP: [
			{ id: "menu", text: "Tap the", strong: "⋯ menu", after: "of this screen." },
			{ id: "open", text: "Choose", strong: "Open in Safari." },
			{ id: "again", text: "In Safari, tap", strong: "Share", after: "then Add to Home Screen." },
		],
		MAC_SAFARI: [
			{ id: "file", text: "Click", strong: "File", after: "in the menu bar," },
			{ id: "dock", text: "then", strong: "Add to Dock." },
		],
		IN_APP_BROWSER: [
			{ id: "menu", text: "Tap the", strong: "⋯ menu", after: "of this screen." },
			{ id: "open", text: "Choose", strong: "Open in browser", after: "(Safari or Chrome)." },
			{ id: "again", text: "Tap", strong: "Install", after: "in your profile there." },
		],
		USE_CHROME: [
			{ id: "open", text: "Tap", strong: "Open in Chrome", after: "below." },
			{
				id: "install",
				text: "In Chrome, tap",
				strong: "Install",
				after: "when it offers, or ⋮ then Install app.",
			},
		],
		REINSTALL_IN_CHROME: [
			{ id: "open", text: "Tap", strong: "Open in Chrome", after: "below." },
			{
				id: "install",
				text: "In Chrome, tap",
				strong: "Install",
				after: "when it offers, or ⋮ then Install app.",
			},
			{
				id: "remove",
				text: "Then remove this one:",
				strong: "long-press its icon",
				after: "and choose Uninstall.",
			},
		],
		ANDROID_MENU: [
			{ id: "menu", text: "Tap the", strong: "⋮ menu", after: "at the top right." },
			{ id: "install", text: "Tap", strong: "Install app", after: "or Add to Home screen." },
			{ id: "confirm", text: "Tap", strong: "Install." },
		],
		DESKTOP_MENU: [
			{
				id: "icon",
				text: "Click the",
				strong: "install icon",
				after: "at the right end of the address bar,",
			},
			{ id: "menu", text: "or open the browser menu and choose", strong: "Install the app." },
		],
		NONE: [],
	} satisfies Record<InstallGuide, Step[]>,
	/** Asked once on an iPhone of someone who opened the Add to Home Screen steps and has not opened the app from the Home Screen since. */
	blocker: {
		title: "Adding the app to your Home Screen",
		question: "You opened the steps last time. What happened?",
		show: "Show me the steps again",
		thanks: "Thank you. That helps us make it easier.",
		close: "Close",
		reasons: [
			{ value: "added", label: "I added it" },
			{ value: "couldnt_find", label: "I couldn't find the buttons" },
			{ value: "too_many_steps", label: "Too many steps" },
			{ value: "prefer_browser", label: "I'd rather use it in Safari" },
			{ value: "later", label: "I'll do it later" },
		] satisfies { value: InstallBlocker; label: string }[],
	},
};
