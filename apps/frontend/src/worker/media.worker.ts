import * as Comlink from "comlink";
import { CDNManager } from "./cdn/cdn.manager";
import { mediaUploadService } from "./cdn/media-upload.service";
import { exportService } from "./cdn/export.service";

console.info("[MediaWorker] Loading dedicated media/processing worker...");

const mediaWorkerApi = {
  cdn: Comlink.proxy(new CDNManager()),
  media: Comlink.proxy(mediaUploadService),
  export: Comlink.proxy(exportService),
};

export type MediaWorkerAPI = typeof mediaWorkerApi;

Comlink.expose(mediaWorkerApi);
