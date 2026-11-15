import { clearAuthCache, clearLastLogin } from "@frontend/utils/auth.persistence";
import { orpcFetch } from "@frontend/utils/orpc.client";
import { getDataProxy } from "@frontend/worker/worker.proxy";
import Dexie from "dexie";

const DB_PREFIX = "app_db_v1_"; // DEXIE_DB_NAME_PREFIX in worker/db/db.manager.ts

const withTimeout = <T>(p: Promise<T>, ms: number) =>
	Promise.race([
		p,
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
	]);

/**
 * Deletes everything this app keeps on the device for any account: the
 * per-user IndexedDB databases and OPFS files (through the DataWorker, which
 * holds them open; directly when it does not answer), the offline auth
 * cache, the remembered account and the push keys. Used when the account was
 * deleted: by the device that asked, and by any device the purge names.
 */
export async function wipeAllLocalData(): Promise<void> {
	try {
		const proxy = await withTimeout(getDataProxy(), 5000);
		await withTimeout(proxy.sync.wipeAllLocalData(), 15000);
	} catch {
		const names = await Dexie.getDatabaseNames();
		await Promise.all(names.filter((n) => n.startsWith(DB_PREFIX)).map((n) => Dexie.delete(n)));
		try {
			const root = await navigator.storage.getDirectory();
			await root.removeEntry("files", { recursive: true });
		} catch {
			// No OPFS tree, or no OPFS: nothing to remove.
		}
	}
	clearAuthCache();
	clearLastLogin();
	try {
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith("push.")) localStorage.removeItem(key);
		}
	} catch {
		// Storage blocked: nothing stored either.
	}
}

let erasureCheck: Promise<void> | null = null;

/**
 * Signed out and online: asks whether an account that used this device was
 * deleted (the server knows the device only by its cookie). If so, wipes and
 * acknowledges. Cheap, idempotent, never throws.
 */
export function runLocalErasureCheck(): Promise<void> {
	if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve();
	erasureCheck ??= (async () => {
		try {
			// Signed out: the call carries no team and waits for no team seed.
			const { erase } = await orpcFetch.account.localDataErasure(undefined, {
				context: { noTeam: true },
			});
			if (!erase) return;
			await wipeAllLocalData();
			await orpcFetch.account.ackLocalDataErasure(undefined, { context: { noTeam: true } });
		} catch (error) {
			console.warn("[local-data] erasure check failed", error);
		} finally {
			erasureCheck = null;
		}
	})();
	return erasureCheck;
}
