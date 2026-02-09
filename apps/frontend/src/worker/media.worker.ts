import * as Comlink from "comlink";
import { CDNManager } from "./cdn/cdn.manager";
import { mediaUploadService } from "./cdn/media-upload.service";

console.info("[MediaWorker] Loading dedicated media/processing worker...");

const mediaWorkerApi = {
  cdn: Comlink.proxy(new CDNManager()),
  media: Comlink.proxy(mediaUploadService),
};

export type MediaWorkerAPI = typeof mediaWorkerApi;

Comlink.expose(mediaWorkerApi);
