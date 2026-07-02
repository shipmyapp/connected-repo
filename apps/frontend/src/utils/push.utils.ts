import { env } from "@frontend/configs/env.config";
import { firebaseApp } from "@frontend/configs/firebase.config";
import { getDeviceEnv } from "@frontend/utils/device.utils";
import { orpcFetch } from "@frontend/utils/orpc.client";
import {
	deleteToken,
	getMessaging,
	getToken,
	isSupported,
} from "firebase/messaging";

const REGISTERED_TOKEN_KEY = "push.fcmToken";
// Timestamp of the last successful backend registration. Used to re-verify
// once every 24h so an upstream purge (Novu subscriber deletion or nightly
// reconcile soft-deleting the row) self-heals on the next app boot instead
// of the client believing forever that it's still registered.
const REGISTERED_AT_KEY = "push.fcmTokenRegisteredAt";
const REGISTER_TTL_MS = 24 * 60 * 60 * 1000;
// Sticky user-intent flag. Browser permission is separate from user intent —
// the user might have "notifications allowed" at the browser level for the
// origin but have explicitly toggled push OFF in our Profile UI. Without this
// flag, syncPushIfGranted() would re-register on next login and fight the
// user's decision.
const OPTED_OUT_KEY = "push.optedOut";

/**
 * Every FCM/permission flow gates on the same set of preconditions. Bail
 * silently if Firebase isn't configured, the browser can't do FCM, or the
 * Notification API is missing (Chrome incognito on some platforms).
 */
async function pushSupported(): Promise<boolean> {
	if (!firebaseApp) return false;
	if (!env.VITE_FIREBASE_VAPID_KEY) return false;
	if (typeof Notification === "undefined") return false;
	if (!(await isSupported())) return false;
	return true;
}

async function fetchTokenAndRegister(): Promise<string | null> {
	if (!firebaseApp || !env.VITE_FIREBASE_VAPID_KEY) return null;
	const registration = await navigator.serviceWorker.ready;
	const messaging = getMessaging(firebaseApp);
	const token = await getToken(messaging, {
		vapidKey: env.VITE_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration: registration,
	});
	if (!token) return null;

	// Skip the round-trip only if BOTH the token matches AND we re-verified
	// with the backend recently. The TTL self-heals from upstream purges
	// (Novu subscriber deletion, reconcile soft-delete) even when the FCM
	// token itself hasn't rotated.
	const cachedToken = localStorage.getItem(REGISTERED_TOKEN_KEY);
	const registeredAtRaw = localStorage.getItem(REGISTERED_AT_KEY);
	const registeredAt = registeredAtRaw ? Number(registeredAtRaw) : 0;
	const stale = Date.now() - registeredAt > REGISTER_TTL_MS;
	if (cachedToken === token && !stale) return token;

	const device = getDeviceEnv();
	await orpcFetch.notifications.registerDevice({
		fcmToken: token,
		userAgent: navigator.userAgent,
		platform: device.platform,
		pwaInstalled: device.isStandalone,
		pwaStandaloneLaunch: device.isStandalone,
	});
	localStorage.setItem(REGISTERED_TOKEN_KEY, token);
	localStorage.setItem(REGISTERED_AT_KEY, String(Date.now()));
	return token;
}

/**
 * Silent path — only registers if the user has ALREADY granted permission
 * in a previous session. Never prompts. Safe to call on login effect from
 * any React component without triggering the browser's native permission
 * modal (which the browser permanently disables for the origin if the user
 * dismisses it once).
 */
export async function syncPushIfGranted(): Promise<void> {
	try {
		if (!(await pushSupported())) return;
		if (Notification.permission !== "granted") return;
		if (localStorage.getItem(OPTED_OUT_KEY) === "true") return;
		await fetchTokenAndRegister();
	} catch (error) {
		console.warn("[push] syncPushIfGranted failed", error);
	}
}

export type PromptResult = "granted" | "denied" | "unsupported";

/**
 * User-gesture path — safe to call the browser's native permission modal.
 * MUST be called from a click/tap handler; browsers will silently deny
 * `Notification.requestPermission()` if it's not driven by user activation.
 */
export async function promptAndRegisterPush(): Promise<PromptResult> {
	try {
		if (!(await pushSupported())) return "unsupported";
		if (Notification.permission === "denied") return "denied";
		if (Notification.permission === "default") {
			const result = await Notification.requestPermission();
			if (result !== "granted") return "denied";
		}
		// Explicit opt-in clears any prior opt-out.
		localStorage.removeItem(OPTED_OUT_KEY);
		await fetchTokenAndRegister();
		return "granted";
	} catch (error) {
		console.warn("[push] promptAndRegisterPush failed", error);
		return "denied";
	}
}

/**
 * Revoke the current FCM token on logout so the browser stops receiving
 * push for this user AND the backend removes it from the Novu subscriber.
 * Failures are logged, not thrown — logout must not block on push cleanup.
 */
export async function revokePushForUser(options?: {
	stickyOptOut?: boolean;
}): Promise<void> {
	try {
		if (options?.stickyOptOut) {
			localStorage.setItem(OPTED_OUT_KEY, "true");
		}
		const cachedToken = localStorage.getItem(REGISTERED_TOKEN_KEY);
		if (!cachedToken) return;
		localStorage.removeItem(REGISTERED_TOKEN_KEY);
		localStorage.removeItem(REGISTERED_AT_KEY);

		await orpcFetch.notifications.revokeDevice({ fcmToken: cachedToken });

		if (firebaseApp && (await isSupported())) {
			const messaging = getMessaging(firebaseApp);
			await deleteToken(messaging);
		}
	} catch (error) {
		console.warn("[push] revokePushForUser failed", error);
	}
}

/**
 * Sync check for UI toggle state / banner visibility. Returns true iff
 * this device currently has an FCM token registered AND the browser
 * permission is still granted (user can revoke via site-settings without
 * telling us).
 */
export function isPushEnabledOnThisDevice(): boolean {
	if (typeof Notification === "undefined") return false;
	if (Notification.permission !== "granted") return false;
	return localStorage.getItem(REGISTERED_TOKEN_KEY) !== null;
}
