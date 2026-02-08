import * as Comlink from "comlink";
import { db, subscribe } from "./db/db.manager";
import { filesDb } from "./db/files.db";
import { journalEntriesDb } from "../modules/journal-entries/worker/journal-entries.db";
import { promptsDb } from "../modules/prompts/worker/prompts.db";
import { CDNManager } from "./cdn/cdn.manager";
import { mediaUploadService } from "./cdn/media-upload.service";

// Unified worker API combining all background services
const appWorkerApi = {
  // Database Manager API (formerly GlobalDBManager)
  db,
  files: filesDb,
  subscribe,
  journal: journalEntriesDb,
  prompts: promptsDb,

  // CDN Manager API (formerly CDNWorkerAPI)
  cdn: new CDNManager(),
  media: mediaUploadService,
};

export type AppWorkerAPI = typeof appWorkerApi;

Comlink.expose(appWorkerApi);
