import { useActiveTeamId } from "@frontend/contexts/WorkspaceContext";
import { useLocalDb } from "@frontend/worker/db/hooks/useLocalDb";
import {
	SYNC_ENGINE_STATE_CHANNEL,
	type SyncEngineStateMessage,
} from "@frontend/worker/sync/sync-engine-state.channel";
import { useEffect, useState } from "react";

export type SyncStatus =
	| "offline"
	| "syncing"
	| "error"
	| "pending"
	| "synced"
	| "idle";

export interface SyncStatusSnapshot {
	status: SyncStatus;
	lastCompletedAt: number | null;
	lastAttemptedAt: number | null;
	lastError: string | null;
	pendingEntries: number;
	pendingFiles: number;
	errorEntries: number;
	errorFiles: number;
}

/** Reactive online/offline hook driven by browser events. */
function useOnline(): boolean {
	const [online, setOnline] = useState<boolean>(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	);
	useEffect(() => {
		const onOnline = () => setOnline(true);
		const onOffline = () => setOnline(false);
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);
		return () => {
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
		};
	}, []);
	return online;
}

/** Subscribes to the orchestrator's transient `isRunning` broadcast. */
function useIsSyncing(): boolean {
	const [isSyncing, setIsSyncing] = useState<boolean>(false);
	useEffect(() => {
		const channel = new BroadcastChannel(SYNC_ENGINE_STATE_CHANNEL);
		const handler = (event: MessageEvent) => {
			const msg = event.data as SyncEngineStateMessage | undefined;
			if (msg && typeof msg.isRunning === "boolean") {
				setIsSyncing(msg.isRunning);
			}
		};
		channel.addEventListener("message", handler);
		return () => {
			channel.removeEventListener("message", handler);
			channel.close();
		};
	}, []);
	return isSyncing;
}

/**
 * Composite sync status for header bubble + settings page. Reads
 * persistent state (lastError, timestamps) from the `syncState` Dexie
 * table, transient `isRunning` from a broadcast channel, and per-team
 * pending/error counts from the module DBs. All reactive.
 *
 * Status precedence (highest first):
 *   offline > error (from lastError or row-level errors) > syncing >
 *   synced (has lastCompletedAt) > idle
 */
export function useSyncStatus(): SyncStatusSnapshot {
	const online = useOnline();
	const isSyncing = useIsSyncing();
	const teamId = useActiveTeamId();

	const { data: cycleState } = useLocalDb("syncState", async (proxy) => {
		return await proxy.syncMetadataDb.getCycleState();
	});

	const { data: pendingEntries } = useLocalDb(
		"journalEntries",
		async (proxy) => (teamId ? await proxy.journalEntriesDb.countPending(teamId) : 0),
		[teamId],
	);
	const { data: errorEntries } = useLocalDb(
		"journalEntries",
		async (proxy) => (teamId ? await proxy.journalEntriesDb.countErrors(teamId) : 0),
		[teamId],
	);
	const { data: pendingFiles } = useLocalDb(
		"files",
		async (proxy) => (teamId ? await proxy.filesDb.countPending(teamId) : 0),
		[teamId],
	);
	const { data: errorFiles } = useLocalDb(
		"files",
		async (proxy) => (teamId ? await proxy.filesDb.countErrors(teamId) : 0),
		[teamId],
	);

	const lastError = cycleState?.lastError ?? null;
	const lastCompletedAt = cycleState?.lastCompletedAt ?? null;
	const lastAttemptedAt = cycleState?.lastAttemptedAt ?? null;
	const errorCount = (errorEntries ?? 0) + (errorFiles ?? 0);
	const pendingCount = (pendingEntries ?? 0) + (pendingFiles ?? 0);

	let status: SyncStatus;
	if (!online) status = "offline";
	else if (isSyncing) status = "syncing";
	else if (lastError || errorCount > 0) status = "error";
	// Pending outweighs "synced" — if items are still waiting to leave the
	// device (queued creates, files not yet uploaded to CDN), the state
	// is NOT synced even if the last cycle completed.
	else if (pendingCount > 0) status = "pending";
	else if (lastCompletedAt) status = "synced";
	else status = "idle";

	return {
		status,
		lastCompletedAt,
		lastAttemptedAt,
		lastError,
		pendingEntries: pendingEntries ?? 0,
		pendingFiles: pendingFiles ?? 0,
		errorEntries: errorEntries ?? 0,
		errorFiles: errorFiles ?? 0,
	};
}
