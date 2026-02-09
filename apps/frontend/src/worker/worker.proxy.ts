import * as Comlink from "comlink";
import type { DataWorkerAPI } from "./data.worker";
import type { MediaWorkerAPI } from "./media.worker";

let dataWorker: Worker | null = null;
let dataProxy: Comlink.Remote<DataWorkerAPI> | null = null;

let mediaWorker: Worker | null = null;
let mediaProxy: Comlink.Remote<MediaWorkerAPI> | null = null;

/**
 * Gets a singleton proxy to the dedicated DataWorker (Database & Logic manager) running in the background.
 */
export const getDataProxy = (): Comlink.Remote<DataWorkerAPI> => {
  if (!dataProxy) {
    dataWorker = new Worker(new URL("./data.worker.ts", import.meta.url), {
      type: "module",
    });
    dataProxy = Comlink.wrap<DataWorkerAPI>(dataWorker);

    // Bridge the MediaWorker proxy to the DataWorker
    // This allows the DataWorker to offload heavy tasks to the MediaWorker
    // without attempting to spawn a nested worker (which is unsupported).
    const media = getMediaProxy();
    dataProxy.setMediaProxy(Comlink.proxy(media));
  }
  return dataProxy;
};

/**
 * Gets a singleton proxy to the dedicated MediaWorker (CDN & Content processing).
 */
export const getMediaProxy = (): Comlink.Remote<MediaWorkerAPI> => {
  if (!mediaProxy) {
    mediaWorker = new Worker(new URL("./media.worker.ts", import.meta.url), {
      type: "module",
    });
    mediaProxy = Comlink.wrap<MediaWorkerAPI>(mediaWorker);
  }
  return mediaProxy;
};

/**
 * Terminates all active worker singletons.
 */
export const terminateWorkers = () => {
  if (dataWorker) {
    dataWorker.terminate();
    dataWorker = null;
    dataProxy = null;
    console.info("[WorkerProxy] DataWorker terminated.");
  }
  if (mediaWorker) {
    mediaWorker.terminate();
    mediaWorker = null;
    mediaProxy = null;
    console.info("[WorkerProxy] MediaWorker terminated.");
  }
};
