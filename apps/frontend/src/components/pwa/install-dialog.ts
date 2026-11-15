import {
	currentInstallGuide,
	type InstallGuide,
	nativePrompt,
	noteNativeAnswer,
} from "@frontend/utils/install-prompt";
import type { PWAInstallElement } from "@khmyznikov/pwa-install";
import type { PropertyValues } from "lit";
import { INSTALL_COPY } from "./install.copy";

/**
 * The install dialog: `<pwa-install>` (@khmyznikov/pwa-install 0.7.0) draws
 * Apple's Share-menu and Add-to-Dock steps as Apple does, sends an in-app
 * browser on an iPhone out to Safari, and puts the browser's own install dialog
 * behind its Install button on Chromium (the offer caught by
 * `utils/install-prompt.ts` is handed over as `externalPromptEvent`; the
 * library's own interception is NOT disabled: `disable-chrome` is what made
 * the template's Install do nothing). It never opens by itself
 * (`manual-apple`, `manual-chrome`): `PwaInstallSheet` decides when.
 * Android's other browsers keep the app's own sheet (`disable-android-fallback`).
 * Loaded only where it is used, the first time; its chunk is kept out of the
 * service worker's precache (vite.config.ts globIgnores).
 */

/** What the person did in the dialog, for the install record. */
type InstallDialogStep = "steps" | "pictures" | "closed" | "accepted" | "failed";

type Listener = (step: InstallDialogStep) => void;

let element: PWAInstallElement | null = null;
let loading: Promise<PWAInstallElement | null> | null = null;
const listeners = new Set<Listener>();
/** The browser's own dialog was handed the caught offer and has not answered yet. */
let isNativeInFlight = false;

const tell = (step: InstallDialogStep) => {
	for (const listener of listeners) listener(step);
};

export const onInstallDialog = (listener: Listener): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const detailOf = (event: Event): Record<string, unknown> =>
	event instanceof CustomEvent && typeof event.detail === "object" && event.detail !== null
		? event.detail
		: {};

const wire = (el: PWAInstallElement) => {
	el.addEventListener("pwa-install-how-to-event", () => tell("steps"));
	el.addEventListener("pwa-install-gallery-event", () => tell("pictures"));
	el.addEventListener("pwa-install-backend-event", (event) => {
		// Only the caught `beforeinstallprompt` is used up by answering; the Web Install API keeps it.
		isNativeInFlight = detailOf(event).backend === "beforeinstallprompt";
	});
	el.addEventListener("pwa-user-choice-result-event", (event) => {
		const outcome = detailOf(event).message === "accepted" ? "accepted" : "dismissed";
		if (isNativeInFlight) noteNativeAnswer(outcome);
		isNativeInFlight = false;
		// Dismissed: the close button, or No in the browser's own dialog; either way, not installed now.
		tell(outcome === "accepted" ? "accepted" : "closed");
	});
	el.addEventListener("pwa-install-fail-event", () => {
		isNativeInFlight = false;
		tell("failed");
	});
};

/** The line above the dialog's buttons: what installing gets the person here. */
const dialogLineFor = (guide: InstallGuide): string => {
	if (guide === "IOS_IN_APP") return INSTALL_COPY.dialogLineIosInApp;
	if (guide === "IOS_SAFARI" || guide === "IOS_OTHER_BROWSER") return INSTALL_COPY.dialogLineIos;
	if (guide === "MAC_SAFARI") return INSTALL_COPY.dialogLineMac;
	return INSTALL_COPY.dialogLine;
};

/** The library's own English for its install button: Apple's names the last step rather than the choice. */
const LIBRARY_INSTALL_LABELS = new Set(["Add to Home Screen", "Add to Dock", "Install"]);
const INSTALL_TAG = "app-pwa-install";

/** Every install button's label, in the dialog and in the parts drawn inside it (Chrome's bar is a component of its own). */
const relabelInstallButtons = (root: ShadowRoot, watched: WeakSet<ShadowRoot>): void => {
	for (const button of root.querySelectorAll("button.install")) {
		const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (LIBRARY_INSTALL_LABELS.has(node.nodeValue?.trim() ?? ""))
				node.nodeValue = INSTALL_COPY.install;
		}
	}
	for (const child of root.querySelectorAll("*")) {
		const inner = child.shadowRoot;
		if (!inner) continue;
		relabelInstallButtons(inner, watched);
		if (watched.has(inner)) continue;
		watched.add(inner);
		// A part redraws on its own (the bar opening into the full dialog): its new label is swapped too.
		new MutationObserver(() => relabelInstallButtons(inner, watched)).observe(inner, {
			childList: true,
			subtree: true,
			characterData: true,
		});
	}
};

/**
 * The dialog's install button says "Install App", like the app's own sheet. The library's English cannot be configured (its
 * translations follow the browser's language), so a subclass swaps the label's
 * text after each render, text node by text node so an icon beside it stays.
 * Translated labels are kept.
 */
const installElementFrom = (Base: typeof PWAInstallElement): typeof PWAInstallElement => {
	const defined = customElements.get(INSTALL_TAG);
	if (defined) return defined as typeof PWAInstallElement;
	class AppPwaInstall extends Base {
		private readonly watchedRoots = new WeakSet<ShadowRoot>();

		protected override updated(changed: PropertyValues): void {
			super.updated(changed);
			if (this.shadowRoot) relabelInstallButtons(this.shadowRoot, this.watchedRoots);
		}
	}
	customElements.define(INSTALL_TAG, AppPwaInstall);
	return AppPwaInstall;
};

/** The manifest the page links now: the static one, or a team's own on its host (team hosts swap the link). */
const linkedManifestUrl = (): string =>
	document.querySelector<HTMLLinkElement>('link[rel~="manifest"]')?.getAttribute("href") ??
	"/manifest.webmanifest";

/** The icon the page offers to iOS (swapped on a team's host): the dialog's fallback icon. */
const appIconUrl = (): string =>
	document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href ??
	"/apple-touch-icon.png";

/** The app's short name on the page (swapped on a team's host): the dialog's fallback name. */
const pageAppName = (): string =>
	document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')?.content ||
	INSTALL_COPY.appName;

const tintColour = (): string =>
	document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content || "#1976d2";

type ManifestIcon = { src: string; sizes?: string; purpose?: string };
type ManifestIdentity = {
	name?: string;
	short_name?: string;
	description?: string;
	icons?: ManifestIcon[];
};

/**
 * Name, description and icon from the linked manifest, so a team's host shows
 * the team's app; the copy's fallbacks when it cannot be read. The static
 * manifest is precached, so this works offline too.
 */
const identityOf = async (
	url: string,
): Promise<{ name: string; description: string; icon: string }> => {
	const fallback = {
		name: pageAppName(),
		description: INSTALL_COPY.description,
		icon: appIconUrl(),
	};
	try {
		const response = await fetch(url, { credentials: "same-origin" });
		if (!response.ok) return fallback;
		const manifest = (await response.json()) as ManifestIdentity;
		const icon = manifest.icons?.find(
			(candidate) =>
				(candidate.purpose ?? "any").split(" ").includes("any") &&
				(candidate.sizes ?? "").split(" ").some((size) => Number(size.split("x")[0]) >= 180),
		);
		return {
			name: manifest.name || manifest.short_name || fallback.name,
			description: manifest.description || fallback.description,
			icon: icon ? new URL(icon.src, new URL(url, window.location.href)).href : fallback.icon,
		};
	} catch {
		return fallback;
	}
};

/** Makes the dialog once, hidden, ready for `openInstallDialog`; null when it cannot load (offline, a blocked script). */
export const prepareInstallDialog = (): Promise<PWAInstallElement | null> => {
	// A team's host swapped the manifest after the dialog was made: make it again for that app.
	if (element && element.getAttribute("manifest-url") !== linkedManifestUrl()) {
		element.remove();
		element = null;
		loading = null;
	}
	if (element) return Promise.resolve(element);
	if (loading) return loading;
	loading = import("@khmyznikov/pwa-install")
		.then(async ({ PWAInstallElement }) => {
			const manifestUrl = linkedManifestUrl();
			const identity = await identityOf(manifestUrl);
			const el = new (installElementFrom(PWAInstallElement))();
			// The manifest the page links, so Apple's steps and Web Install both treat this app as the one to install.
			el.setAttribute("manifest-url", manifestUrl);
			el.setAttribute("manual-apple", "");
			el.setAttribute("manual-chrome", "");
			el.setAttribute("disable-android-fallback", "");
			// Named here too, so the dialog never falls back to the library's "PWA" if the manifest is slow.
			el.setAttribute("name", identity.name);
			el.setAttribute("description", identity.description);
			el.setAttribute("icon", identity.icon);
			el.setAttribute("install-description", dialogLineFor(currentInstallGuide()));
			el.styles = { "--tint-color": tintColour() };
			const caught = nativePrompt();
			if (caught) el.externalPromptEvent = caught;
			wire(el);
			document.body.appendChild(el);
			// Its first render follows its own setup (platform, manifest); before that it would hide again.
			await el.updateComplete;
			element = el;
			return el;
		})
		.catch(() => {
			loading = null;
			return null;
		});
	return loading;
};

/**
 * Opens the dialog on its first screen: the app, what installing gets the
 * person, and its Install and pictures buttons. The steps come only after the
 * person taps Install there ("it makes the user invested in the
 * action, or else they just avoid it"), however it was opened. Resolves false
 * when the dialog could not load; the caller shows its own sheet.
 */
export const openInstallDialog = async (): Promise<boolean> => {
	const el = await prepareInstallDialog();
	if (!el) return false;
	// The offer may have arrived after the dialog was made.
	const caught = nativePrompt();
	if (caught && el.externalPromptEvent !== caught) el.externalPromptEvent = caught;
	el.showDialog(true);
	return true;
};
