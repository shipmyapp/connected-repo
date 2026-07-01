/**
 * Isomorphic accessor for the `x-team-id` header value.
 *
 * ## Two access shapes
 *
 * - `getActiveTeamIdForRequests()` — synchronous read of the current
 *   value. Returns `null` if never set. Useful for non-blocking checks.
 * - `getActiveTeamIdReady()` — returns a Promise that resolves once the
 *   value has been set at least once (even to `null`). This is what the
 *   RPC link's `async headers()` awaits, so no request can go out with
 *   an *unset* header cache.
 *
 * The distinction matters because "unset" and "logged out (null)" are
 * different states:
 *   - unset  → RPC should wait (cache hasn't been seeded yet)
 *   - null   → RPC should proceed without `x-team-id` (logged out /
 *              anonymous / bootstrap)
 *
 * ## Two contexts
 *
 * - **Main thread:** seeded by `authLoader` synchronously right after
 *   `authClient.getSession()`, then re-seeded on team switch via
 *   `WorkspaceContext.setActiveTeam` → `syncSetActiveTeam` →
 *   `setActiveTeamIdForRequests`.
 * - **Worker:** the main thread pushes the value via
 *   `dataProxy.sync.setActiveTeamId(teamId)`. The dynamic import below
 *   subscribes to `onActiveTeamChange` so the worker's `workerCache`
 *   mirrors the main-thread source of truth.
 */

let mainCache: string | null = null;
let workerCache: string | null = null;

// A one-shot signal: `promise` pends until the FIRST call to
// `setActiveTeamIdForRequests`. Subsequent calls swap in an
// already-resolved promise so new awaiters get the latest value
// immediately.
let mainReady = createDeferred<string | null>();
let mainReadyHasResolved = false;

let workerReady = createDeferred<string | null>();
let workerReadyHasResolved = false;

const isWindow = typeof window !== "undefined";

if (!isWindow && typeof self !== "undefined") {
	void (async () => {
		try {
			const mod = await import("../worker/sync/active_team");
			const initial = mod.getActiveTeamId();
			workerCache = initial;
			workerReadyHasResolved = true;
			workerReady.resolve(initial);
			mod.onActiveTeamChange((id) => {
				workerCache = id;
				if (!workerReadyHasResolved) {
					workerReadyHasResolved = true;
					workerReady.resolve(id);
				} else {
					workerReady = createResolved(id);
				}
			});
		} catch {
			workerCache = null;
			workerReadyHasResolved = true;
			workerReady.resolve(null);
		}
	})();
}

export const setActiveTeamIdForRequests = (teamId: string | null): void => {
	if (!isWindow) return;
	mainCache = teamId;
	if (!mainReadyHasResolved) {
		mainReadyHasResolved = true;
		mainReady.resolve(teamId);
	} else {
		// Replace with an already-resolved promise so any awaiter created
		// *after* this point resolves synchronously with the latest value.
		mainReady = createResolved(teamId);
	}
};

export const getActiveTeamIdForRequests = (): string | null => {
	if (isWindow) return mainCache;
	return workerCache;
};

/**
 * Awaited by the RPC link's `async headers()`. Blocks until the cache has
 * been seeded at least once; then resolves near-instantly on every call.
 */
export const getActiveTeamIdReady = (): Promise<string | null> => {
	if (isWindow) return mainReady.promise;
	return workerReady.promise;
};

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function createResolved<T>(v: T): Deferred<T> {
	return { promise: Promise.resolve(v), resolve: () => {} };
}
