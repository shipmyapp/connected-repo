import { env } from "@backend/configs/env.config";
import { logger } from "@backend/utils/logger.utils";
import admin from "firebase-admin";
import type { Messaging } from "firebase-admin/messaging";

/**
 * Server-side FCM handle. Bypasses Novu for silent-sync pushes so we
 * can send data-only messages (no notification block) directly to the
 * push_devices token pool without paying Novu workflow-execution cost
 * on every 3-minute tick.
 *
 * `null` when neither credential var is set (CI, local dev without a
 * Firebase project). All call sites must handle the null case as a
 * no-op — silent push is best-effort; the client's own periodic sync
 * trigger (60s interval + visibilitychange/focus/online) covers the
 * uninstalled-push case.
 */
function initFirebaseAdmin(): admin.app.App | null {
	if (admin.apps.length > 0) {
		return admin.apps[0] ?? null;
	}

	if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
		try {
			const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount;
			return admin.initializeApp({
				credential: admin.credential.cert(parsed),
			});
		} catch (err) {
			logger.error(
				{ err },
				"[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON — silent push disabled",
			);
			return null;
		}
	}

	if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
		try {
			return admin.initializeApp({
				credential: admin.credential.applicationDefault(),
			});
		} catch (err) {
			logger.error(
				{ err },
				"[firebase-admin] applicationDefault() failed — silent push disabled",
			);
			return null;
		}
	}

	return null;
}

const firebaseAdminApp = initFirebaseAdmin();

export const firebaseMessaging: Messaging | null = firebaseAdminApp
	? admin.messaging(firebaseAdminApp)
	: null;
