import { env } from "@frontend/configs/env.config";
import { useAsksStore } from "@frontend/lib/asks/asks.store";
import { knownDeviceHere, refreshDeviceHere } from "@frontend/lib/device/use-device-here";
import { reportDevice } from "@frontend/lib/device/use-device-report";
import { orpcFetch } from "@frontend/utils/orpc.client";

/**
 * Push on this device, end to end:
 *   permission (a tap) → Firebase `getToken` (VAPID, THIS service worker) →
 *   `devices.report({ fcmToken })` → server: devices row + Novu subscriber `fcm`
 *   credentials (full list) → Novu workflows' push steps reach the device.
 * Off: `devices.pushOff` (the row keeps its address for the record; Novu is
 * told). A dead address is pruned by Novu and mirrored nightly
 * (reconcile_fcm_tokens cron). Nothing about the address is cached here; the
 * server takes a repeated report in its stride.
 *
 * Firebase is loaded only when push is touched: it is not in the first bundle.
 */
const loadFirebase = async () => {
	const [{ firebaseApp }, messaging] = await Promise.all([
		import("@frontend/configs/firebase.config"),
		import("firebase/messaging"),
	]);
	return { firebaseApp, ...messaging };
};

// Push off in Profile, per account on this device (a
// person's choice never passes to the next account on a shared phone). Browser
// permission is separate from intent: notifications can be allowed for the
// origin while this person switched push off here, and syncPushIfGranted()
// must not fight that. The only device-related localStorage key kept: it is
// read before `devices.here` is known (an offline start).
const optedOutKey = (userId: string) => `push.optedOut.${userId}`;
// Before the device record it was the device's, whoever was signed in.
const LEGACY_OPTED_OUT_KEY = "push.optedOut";

/** The account push is working for on this device; bound by the signed-in layout, cleared at sign-out. */
let account: { userId: string } | null = null;
/** Push turned on here in this visit, before `devices.here` says so. */
let isOnThisVisit = false;

const readFlag = (key: string) => {
	try {
		return localStorage.getItem(key) === "true";
	} catch {
		return false;
	}
};
const writeFlag = (key: string, isOn: boolean) => {
	try {
		if (isOn) localStorage.setItem(key, "true");
		else localStorage.removeItem(key);
	} catch {
		// Storage can be blocked: the choice holds for this visit's calls only.
	}
};

export function bindPushAccount(userId: string): void {
	account = { userId };
	// The old device-wide opt-out was almost surely this person's: it becomes theirs, once.
	if (readFlag(LEGACY_OPTED_OUT_KEY)) writeFlag(optedOutKey(userId), true);
	writeFlag(LEGACY_OPTED_OUT_KEY, false);
}

const isOptedOut = () => (account ? readFlag(optedOutKey(account.userId)) : false);

/**
 * Every FCM/permission flow gates on the same set of preconditions. Bail
 * silently if Firebase isn't configured, the browser can't do FCM, or the
 * Notification API is missing (Chrome incognito on some platforms).
 */
async function pushSupported(): Promise<boolean> {
	if (!env.VITE_FIREBASE_VAPID_KEY) return false;
	if (typeof Notification === "undefined") return false;
	const { firebaseApp, isSupported } = await loadFirebase();
	if (!firebaseApp) return false;
	return isSupported();
}

/** The device's push address, handed to the device report. */
async function fetchTokenAndRegister(): Promise<string | null> {
	if (!env.VITE_FIREBASE_VAPID_KEY) return null;
	const { firebaseApp, getMessaging, getToken } = await loadFirebase();
	if (!firebaseApp) return null;
	const registration = await navigator.serviceWorker.ready;
	const messaging = getMessaging(firebaseApp);
	const token = await getToken(messaging, {
		vapidKey: env.VITE_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration: registration,
	});
	if (!token) return null;
	await reportDevice({ fcmToken: token, pushPermission: "granted" });
	isOnThisVisit = true;
	return token;
}

/**
 * Silent path: registers only if the browser ALREADY allows notifications,
 * this person did not switch push off here, and this ACCOUNT has said yes in
 * the app (`asks.push.grantedAt`: a person signing in on a phone
 * someone else allowed is asked in the app first). Never prompts. Called on
 * sign-in and on reconnect (WorkspaceContext). Offline it fails quietly.
 */
export async function syncPushIfGranted(): Promise<void> {
	try {
		if (!(await pushSupported())) return;
		if (Notification.permission !== "granted") return;
		if (!account || isOptedOut()) return;
		const asks = await useAsksStore.getState().ensureLoaded();
		if (!asks.push?.grantedAt) return;
		await fetchTokenAndRegister();
	} catch (error) {
		console.warn("[push] syncPushIfGranted failed", error);
	}
}

type PromptResult = "granted" | "denied" | "unsupported";

/**
 * User-gesture path: safe to call the browser's native permission modal. MUST
 * be called from a click/tap handler. Records the answer on the ask ladder
 * (granted ends the push ask on the account; a browser refusal quiets it for a
 * month), so callers need not.
 */
export async function promptAndRegisterPush(): Promise<PromptResult> {
	try {
		if (!(await pushSupported())) return "unsupported";
		if (Notification.permission === "denied") {
			void useAsksStore.getState().record("push", "denied");
			return "denied";
		}
		if (Notification.permission === "default") {
			const result = await Notification.requestPermission();
			if (result !== "granted") {
				void useAsksStore.getState().record("push", "denied");
				return "denied";
			}
		}
		// Explicit opt-in clears this person's prior opt-out.
		if (account) writeFlag(optedOutKey(account.userId), false);
		void useAsksStore.getState().record("push", "granted");
		await fetchTokenAndRegister();
		return "granted";
	} catch (error) {
		console.warn("[push] promptAndRegisterPush failed", error);
		return "denied";
	}
}

/**
 * Unlinks this device from the signed-in account: the server stops sending
 * this person's notifications here at once. The phone keeps its push address
 * and its permission, so the next account to sign in is linked again without
 * a prompt (deleting the address would gain nothing and could, on an iPhone,
 * leave the next account without push). With `stickyOptOut` (the Profile
 * switch) the person's choice is kept for them on this device. Failures are
 * logged, not thrown: sign-out never waits on push, and the next account's
 * registration takes the address off this one on the server anyway.
 */
export async function revokePushForUser(options?: { stickyOptOut?: boolean }): Promise<void> {
	try {
		if (options?.stickyOptOut && account) writeFlag(optedOutKey(account.userId), true);
		isOnThisVisit = false;
		await orpcFetch.devices.pushOff({
			reason: options?.stickyOptOut ? "switched_off" : "signed_out",
		});
		void refreshDeviceHere();
	} catch (error) {
		console.warn("[push] revokePushForUser failed", error);
	}
}

/** Sign-out: the device is no longer this person's to notify. */
export async function unbindPushAccount(): Promise<void> {
	await revokePushForUser();
	account = null;
	isOnThisVisit = false;
}

/**
 * For the toggle and the nudges: the browser still allows notifications (it
 * can be revoked in site settings without telling us) and push is on here for
 * this account, as turned on in this visit or as the server last said
 * (`devices.here`). While the server's answer is unknown (an offline start),
 * "allowed and not switched off" stands in.
 */
export function isPushEnabledOnThisDevice(): boolean {
	if (typeof Notification === "undefined") return false;
	if (Notification.permission !== "granted") return false;
	if (isOnThisVisit) return true;
	const here = knownDeviceHere();
	return here ? here.pushHere : !isOptedOut();
}
