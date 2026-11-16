import { env } from "@backend/configs/env.config";
import { logger } from "@backend/utils/logger.utils";
import {
	type App,
	applicationDefault,
	cert,
	getApps,
	initializeApp,
	type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

/**
 * Server-side FCM handle. Bypasses Novu for silent-sync pushes so we
 * can send data-only messages (no notification block) directly to the
 * the `devices` push addresses without paying Novu workflow-execution cost
 * on every 3-minute tick.
 *
 * `null` when neither credential var is set (CI, local dev without a
 * Firebase project). All call sites must handle the null case as a
 * no-op — silent push is best-effort; the client's own periodic sync
 * trigger (60s interval + visibilitychange/focus/online) covers the
 * uninstalled-push case.
 */
function initFirebaseAdmin(): App | null {
	const existing = getApps();
	if (existing.length > 0) {
		return existing[0] ?? null;
	}

	if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
		try {
			const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
			return initializeApp({
				credential: cert(parsed),
			});
		} catch (err) {
			logger.error(
				{ err },
				"[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON — silent push disabled",
			);
			return null;
		}
	}

	if (env.GOOGLE_APPLICATION_CREDENTIALS) {
		try {
			return initializeApp({
				credential: applicationDefault(),
			});
		} catch (err) {
			logger.error({ err }, "[firebase-admin] applicationDefault() failed — silent push disabled");
			return null;
		}
	}

	return null;
}

const firebaseAdminApp = initFirebaseAdmin();

export const firebaseMessaging: Messaging | null = firebaseAdminApp
	? getMessaging(firebaseAdminApp)
	: null;
