/**
 * Broadcast channel for the SyncOrchestrator's transient in-memory state
 * — specifically `isRunning`. Persistent state (lastAttemptedAt,
 * lastCompletedAt, lastError) already rides on the `syncState` Dexie
 * table + `"db-updates"` channel; the sync-status UI reads that via the
 * normal DataWorker path. This channel only carries the "is a cycle
 * currently in flight" bit that's too transient to be worth a Dexie
 * write on every phase transition.
 *
 * Producer: `sync.orchestrator.ts` (worker realm).
 * Consumer: `<SyncBubble />` (main thread).
 */

export const SYNC_ENGINE_STATE_CHANNEL = "sync-engine-state";

export interface SyncEngineStateMessage {
	isRunning: boolean;
}
