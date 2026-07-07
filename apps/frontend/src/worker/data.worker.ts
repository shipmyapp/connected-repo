import * as Comlink from "comlink";
import { journalEntriesDb } from "../modules/journal-entries/worker/journal-entries.db";
import { promptsDb } from "../modules/prompts/worker/prompts.db";
import { subscribe } from "./db/db.manager";
import { filesDb } from "./db/files.db";
import { syncMetadataDb } from "./db/sync_metadata.db";
import { teamMembersDb } from "./db/team_members.db";
import { teamsAppDb } from "./db/teams_app.db";
import type { MediaWorkerAPI } from "./media.worker";
import { syncOrchestrator } from "./sync/sync.orchestrator";
import { setMediaProxyInternal } from "./worker.context";

/**
 * The DataWorker owns the per-user Dexie DB, every table-specific DB
 * adapter, and the SyncOrchestrator. Comlink-exposes them to the main
 * thread.
 *
 * Lifecycle:
 *   - Main thread instantiates DataWorker + MediaWorker on load.
 *   - Main thread calls `sync.initForUser(userId)` right after login.
 *     Only then is the per-user Dexie DB opened; module DB adapters
 *     throw until this completes.
 *   - Main thread calls `sync.setActiveTeamId(id)` on team switch
 *     (only from the profile page).
 *
 * The MediaWorker is connected via a direct MessageChannel: the main thread
 * brokers a port to `connectMediaPort`, and the FileUploadWorker calls
 * `generateThumbnail` over it worker-to-worker (no main-thread hop).
 */
const dataWorkerApi = {
	filesDb: Comlink.proxy(filesDb),
	journalEntriesDb: Comlink.proxy(journalEntriesDb),
	promptsDb: Comlink.proxy(promptsDb),
	teamsAppDb: Comlink.proxy(teamsAppDb),
	teamMembersDb: Comlink.proxy(teamMembersDb),
	syncMetadataDb: Comlink.proxy(syncMetadataDb),
	sync: Comlink.proxy(syncOrchestrator),
	subscribe: Comlink.proxy(subscribe),

	/**
	 * Receive the MediaWorker end of a MessageChannel (transferred from the
	 * main thread) and wrap it as a direct Comlink proxy.
	 */
	connectMediaPort(port: MessagePort): void {
		setMediaProxyInternal(Comlink.wrap<MediaWorkerAPI>(port));
	},
};

export type DataWorkerAPI = typeof dataWorkerApi;
Comlink.expose(dataWorkerApi);
