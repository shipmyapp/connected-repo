import * as Comlink from 'comlink';
import type { DBManager } from './db.manager';

let worker: Worker | null = null;
let dbProxy: Comlink.Remote<DBManager> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initializes the database and ensures it's called exactly once.
 */
const ensureInitialized = async (proxy: Comlink.Remote<DBManager>): Promise<void> => {
	if (initPromise) return initPromise;
	
	initPromise = proxy.init();
	return initPromise;
};

/**
 * Initializes and returns a proxy to the DB worker.
 * Ensures the database is initialized before the promise resolves.
 */
export const getDBProxy = async (): Promise<Comlink.Remote<DBManager>> => {
	if (!dbProxy) {
		worker = new Worker(new URL('./db.worker.ts', import.meta.url), {
			type: 'module',
		});
		dbProxy = Comlink.wrap<DBManager>(worker);
	}

	await ensureInitialized(dbProxy);
	return dbProxy;
};
