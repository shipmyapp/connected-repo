import * as Comlink from "comlink";
console.info("[AppWorker] Loading consolidated worker...");
import { db, subscribe } from "./db/db.manager";
import { filesDb } from "./db/files.db";
import { journalEntriesDb } from "../modules/journal-entries/worker/journal-entries.db";
import { promptsDb } from "../modules/prompts/worker/prompts.db";
import { CDNManager } from "./cdn/cdn.manager";
import { mediaUploadService } from "./cdn/media-upload.service";
import { pendingSyncJournalEntriesDb } from "./db/pending-sync-journal-entries.db";
import { syncOrchestrator } from "./sync/sync.orchestrator";

// Unified worker API - Flattened for better Comlink proxy support
const appWorkerApi = {
  // Core DB
  db: Comlink.proxy(db),
  filesDb: Comlink.proxy(filesDb),
  subscribe,

  // Domain Managers
  journalEntriesDb: Comlink.proxy(journalEntriesDb),
  pendingSyncJournalEntriesDb: Comlink.proxy(pendingSyncJournalEntriesDb),
  promptsDb: Comlink.proxy(promptsDb),

  // CDN & Media
  cdn: Comlink.proxy(new CDNManager()),
  media: Comlink.proxy(mediaUploadService),
  sync: Comlink.proxy(syncOrchestrator),
};

export type AppWorkerAPI = typeof appWorkerApi;

Comlink.expose(appWorkerApi);
