import * as Comlink from "comlink";
import type { DataWorkerAPI } from "./data.worker";
import type { MediaWorkerAPI } from "./media.worker";
import { ProxyCell } from "./utils/ProxyCell";

let dataWorker: Worker | null = null;
let mediaWorker: Worker | null = null;

const dataProxyCell = new ProxyCell<Comlink.Remote<DataWorkerAPI>>();
const mediaProxyCell = new ProxyCell<Comlink.Remote<MediaWorkerAPI>>();

/**
 * Gets a singleton proxy to the dedicated DataWorker (Database & Logic manager).
 */
export const getDataProxy = (): Promise<Comlink.Remote<DataWorkerAPI>> => {
  if (dataProxyCell.isInitial) {
    const worker = new Worker(new URL("./data.worker.ts", import.meta.url), {
      type: "module",
    });
    dataWorker = worker;
    const proxy = Comlink.wrap<DataWorkerAPI>(worker);
    
    // Bridge the MediaWorker proxy to the DataWorker
    getMediaProxy().then(media => {
      proxy.setMediaProxy(Comlink.proxy(media));
    });
    
    dataProxyCell.set(proxy);
  }
  
  return dataProxyCell.get();
};

/**
 * Gets a singleton proxy to the dedicated MediaWorker (CDN & Content processing).
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
  if (dataWorker) {
    dataWorker.terminate();
    dataWorker = null;
    dataProxyCell.reset();
    console.info("[WorkerProxy] DataWorker terminated.");
  }
  if (mediaWorker) {
    mediaWorker.terminate();
    mediaWorker = null;
    mediaProxyCell.reset();
    console.info("[WorkerProxy] MediaWorker terminated.");
  }
};
