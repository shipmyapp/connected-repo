import * as Comlink from "comlink";
import type { MediaWorkerAPI } from "./media.worker";
import { ProxyCell } from "./utils/ProxyCell";

let mediaWorker: Worker | null = null;

const mediaProxyCell = new ProxyCell<Comlink.Remote<MediaWorkerAPI>>();

/**
 * Gets a singleton proxy to the dedicated MediaWorker (thumbnail generation
 * and CDN upload pipeline). The worker is lazily instantiated on first call.
 */
export const getMediaProxy = (): Promise<Comlink.Remote<MediaWorkerAPI>> => {
  if (mediaProxyCell.isInitial) {
    const worker = new Worker(new URL("./media.worker.ts", import.meta.url), {
      type: "module",
    });
    mediaWorker = worker;
    mediaProxyCell.set(Comlink.wrap<MediaWorkerAPI>(worker));
  }
  return mediaProxyCell.get();
};

/**
 * Terminates all active worker singletons.
 */
export const terminateWorkers = () => {
  if (mediaWorker) {
    mediaWorker.terminate();
    mediaWorker = null;
    mediaProxyCell.reset();
  }
};
