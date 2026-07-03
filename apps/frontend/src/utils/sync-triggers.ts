import { setActiveTeamIdForRequests } from "@frontend/utils/active_team_header.client";
import {
	getDataProxy,
	getMediaProxy,
	isMediaProxyReady,
	terminateWorkers,
} from "@frontend/worker/worker.proxy";

/**
 * Main-thread bridge to the DataWorker sync engine. Owns:
 *
 *   1. Login/logout wiring — opens the per-user Dexie DB, seeds the
 *      active team, installs triggers.
 *   2. Trigger installation — visibilitychange, focus, online,
 *      2-minute interval (only when the tab is visible).
 *   3. Active-team change propagation — profile-page switcher calls
 *      `setActiveTeam(teamId)` and both the header cache AND the worker
 *      cache flip in lockstep.
 *
 * The DataWorker's `sync.processQueue()` is idempotent — a trigger
 * arriving during a cycle sets a rescan bit and the running cycle
 * re-invokes itself, so over-triggering is safe.
 *
 * The 2-minute in-app tick is the fallback for devices that never
 * granted push permission (silent-sync push is the primary trigger
 * when it's available; see `silent_sync_dispatch.cron.ts` — every
 * 3 minutes). Gating on `document.visibilityState === "visible"`
 * stops the timer from firing when the tab is hidden or in the
 * background; the visibility-change handler kicks a fresh sync the
 * moment the user comes back, so nothing is lost.
 */

let triggersInstalled = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let removeHandlers: (() => void) | null = null;

async function kick(): Promise<void> {
	try {
		const proxy = await getDataProxy();
		await proxy.sync.processQueue();
	} catch (err) {
		console.warn("[sync-triggers] failed to kick sync", err);
	}
}

/**
 * Call from the login flow after the session is established. Opens
 * the per-user Dexie DB (dropping any other user's DB on this device),
 * seeds the active team (from `user.activeTeamAppId`), and installs
 * background triggers. Idempotent for the same userId.
 */
export async function initSyncForUser(
	userId: string,
	activeTeamAppId: string | null,
): Promise<void> {
	// Set the main-thread header cache FIRST, synchronously, so any query
	// that fires during the await below already carries `x-team-id`.
	// Setting it after the awaits used to race with `journalEntries.getAll`
	// on first paint → 403 "Active team id mismatch".
	setActiveTeamIdForRequests(activeTeamAppId);
	const proxy = await getDataProxy();
	await proxy.sync.initForUser(userId);
	await proxy.sync.setActiveTeamId(activeTeamAppId);
	installTriggers();
}

/**
 * Called by the profile-page team switcher after a successful
 * `POST /me/active-team-id`. Updates the ORPC header cache AND the
 * worker cache so subsequent RPCs (including sync round-trips) use
 * the new team id.
 */
export async function setActiveTeam(teamId: string | null): Promise<void> {
	setActiveTeamIdForRequests(teamId);
	const proxy = await getDataProxy();
	await proxy.sync.setActiveTeamId(teamId);
	// Also push into the media worker if it's already spawned. A cold media
	// worker will pick up the current value from `getActiveTeamIdForRequests()`
	// at spawn time (see `getMediaProxy`), so we skip when not ready to avoid
	// spawning it just to hold a string.
	if (isMediaProxyReady()) {
		const mediaProxy = await getMediaProxy();
		await mediaProxy.setActiveTeamId(teamId);
	}
}

/**
 * Called on logout. The Dexie DB is NOT deleted (that only happens
 * when a different user signs in on this device). Workers stay alive
 * so a same-user re-login is instant.
 */
export function onLogout(): void {
	setActiveTeamIdForRequests(null);
	uninstallTriggers();
	// Workers are kept alive across logout for same-user re-login. Clear the
	// media worker's header cache too if it's warm — no need to spawn it
	// otherwise.
	if (isMediaProxyReady()) {
		void getMediaProxy().then((mp) => mp.setActiveTeamId(null));
	}
}

// NOTE: There is no explicit main-thread "wipe this team" bridge and
// deliberately so — the pull pipeline in the DataWorker discovers
// team-delete and self-membership-revoked tombstones inline (see
// `SyncOrchestrator.collectTeamTombstones` /
// `collectSelfMembershipTombstones`) and invokes
// `wipeTeamDataFromDb(teamId)` from inside the cycle. When the currently
// active team is the one that got wiped, the orchestrator broadcasts on
// the `active-team-wiped` channel; `WorkspaceContext` listens and drives
// the switch-gate flow (auto-switch to another team or force sign-out).
// Adding a UI-facing wipe helper here would give callers a second entry
// point that bypasses the switch-gate coordination — resist it.

/**
 * Full teardown for tests / hard resets — terminates the workers.
 * The DB file stays on disk.
 */
export function tearDownSync(): void {
	uninstallTriggers();
	terminateWorkers();
}

function installTriggers(): void {
	if (triggersInstalled) return;
	triggersInstalled = true;

	const onVisibility = () => {
		if (document.visibilityState === "visible") void kick();
	};
	const onFocus = () => {
		void kick();
	};
	const onOnline = () => {
		void kick();
	};

	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("focus", onFocus);
	window.addEventListener("online", onOnline);

	// 2-minute foreground sync tick. Only fires while the tab is visible
	// — a backgrounded tab burns battery for nothing and the silent-sync
	// push (or the next visibilitychange) will catch it up on return.
	intervalHandle = setInterval(() => {
		if (document.visibilityState !== "visible") return;
		void kick();
	}, 120_000);

	removeHandlers = () => {
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("focus", onFocus);
		window.removeEventListener("online", onOnline);
	};

	// Fire once on install to catch up any pending state left behind.
	void kick();
}

function uninstallTriggers(): void {
	if (!triggersInstalled) return;
	triggersInstalled = false;
	removeHandlers?.();
	removeHandlers = null;
	if (intervalHandle) {
		clearInterval(intervalHandle);
		intervalHandle = null;
	}
}
