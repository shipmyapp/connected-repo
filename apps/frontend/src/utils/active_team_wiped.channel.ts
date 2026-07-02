/**
 * Cross-context signal fired by the DataWorker's sync pipeline when a
 * tombstone pulls the current active team out from under the user
 * (either the team was deleted server-side, or the user's membership
 * was revoked). See `SyncOrchestrator.processTeamWipes`.
 *
 * The channel lives in its own tiny module (not in the orchestrator
 * itself) so main-thread callers can import the constant + message
 * type WITHOUT dragging along the worker's transitive imports (Dexie,
 * OPFS, etc.). BroadcastChannel wiring is left to callers because the
 * lifetime expectations differ: the worker holds a long-lived producer
 * channel; consumers on the main thread create + close their own
 * channel inside a React effect.
 */

export const ACTIVE_TEAM_WIPED_CHANNEL = "active-team-wiped";

export interface ActiveTeamWipedMessage {
	type: "active-team-wiped";
	wipedTeamId: string;
}
