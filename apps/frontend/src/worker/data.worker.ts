import * as Comlink from "comlink";
console.info("[DataWorker] Loading dedicated database worker...");
import { clientDb, subscribe } from "./db/db.manager";
import { filesDb } from "./db/files.db";
import { journalEntriesDb } from "../modules/journal-entries/worker/journal-entries.db";
import { promptsDb } from "../modules/prompts/worker/prompts.db";
import { teamsAppDb } from "./db/teams_app.db";
import { syncOrchestrator } from "./sync/sync.orchestrator";
import { setMediaProxyInternal } from "./worker.context";
import type { MediaWorkerAPI } from "./media.worker";
import { teamMembersDb } from "./db/team_members.db";

// No longer defined here, imported from worker.context

// Unified worker API - Flattened for better Comlink proxy support
const dataWorkerApi = {
  // Core DB
  db: Comlink.proxy(clientDb),
  filesDb: Comlink.proxy(filesDb),
  subscribe,

  // Domain Managers
  journalEntriesDb: Comlink.proxy(journalEntriesDb),
  promptsDb: Comlink.proxy(promptsDb),
  teamsAppDb: Comlink.proxy(teamsAppDb),
  teamMembersDb: Comlink.proxy(teamMembersDb),

  // Orchestrators
  sync: Comlink.proxy(syncOrchestrator),

  // Bridge
  setMediaProxy(proxy: Comlink.Remote<MediaWorkerAPI>) {
    setMediaProxyInternal(proxy);
    console.info("[DataWorker] MediaProxy bridged successfully.");
  },
};

export type DataWorkerAPI = typeof dataWorkerApi;

Comlink.expose(dataWorkerApi);

// Start orchestrator after exposure to ensure all dependencies are ready
syncOrchestrator.start();
