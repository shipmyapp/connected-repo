import Dexie from "dexie";
import { ClientDatabase, DEXIE_DB_NAME_PREFIX, dbNameFor } from "./db.manager";

/**
 * Lifecycle guardian for the per-user Dexie DB.
 *
 * Rules:
 *   - DB name is `app_db_v1_${userId}`.
 *   - A user's DB is NOT deleted on logout — they see their data if
 *     they log back in on the same device.
 *   - When a DIFFERENT user signs in, every prior user's DB is dropped
 *     first. This is the only sanctioned wipe.
 *
 * The DataWorker calls `initDb(userId)` on boot / user-change before
 * running any DB operation. All module adapters read the DB handle
 * through `getClientDb()` — throws if not initialised.
 */

let currentDb: ClientDatabase | null = null;
let currentUserId: string | null = null;
let initPromise: Promise<ClientDatabase> | null = null;

export async function initDb(userId: string): Promise<ClientDatabase> {
	if (!userId) throw new Error("initDb requires a userId");

	if (currentUserId === userId && currentDb) return currentDb;

	if (initPromise) return initPromise;

	initPromise = (async () => {
		// Close and drop DBs for any OTHER user that has ever run on this
		// device. Prior current user's DB (currentUserId) is closed first;
		// then we scan Dexie's known-DB list for any other prefixed name.
		if (currentDb) {
			currentDb.close();
			currentDb = null;
		}

		const targetName = dbNameFor(userId);
		const existingNames = await Dexie.getDatabaseNames();
		const stale = existingNames.filter(
			(n) => n.startsWith(DEXIE_DB_NAME_PREFIX) && n !== targetName,
		);
		await Promise.all(stale.map((n) => Dexie.delete(n)));

		const db = new ClientDatabase(targetName);
		await db.open();

		currentDb = db;
		currentUserId = userId;
		return db;
	})();

	try {
		return await initPromise;
	} finally {
		initPromise = null;
	}
}

export function getClientDb(): ClientDatabase {
	if (!currentDb) {
		throw new Error(
			"Dexie DB not initialised — call `dataProxy.sync.initForUser(userId)` before any DB operation",
		);
	}
	return currentDb;
}

export function getCurrentUserId(): string | null {
	return currentUserId;
}

/**
 * Explicit logout — closes the DB handle but keeps the DB file on disk
 * so a re-login rehydrates the same data. If another user then signs
 * in, `initDb` drops the stale DB before opening theirs.
 */
export function closeDb(): void {
	if (currentDb) {
		currentDb.close();
		currentDb = null;
	}
	currentUserId = null;
}
