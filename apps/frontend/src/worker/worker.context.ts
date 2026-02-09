import * as Comlink from "comlink";
import type { MediaWorkerAPI } from "./media.worker";

let mediaProxy: Comlink.Remote<MediaWorkerAPI> | null = null;

/**
 * Internal getter for the bridged media worker proxy.
 * Used by background services like SyncOrchestrator.
 */
export const getMediaProxyInternal = () => mediaProxy;

/**
 * Internal setter for the bridged media worker proxy.
 * Called by DataWorker.setMediaProxy.
 */
export const setMediaProxyInternal = (proxy: Comlink.Remote<MediaWorkerAPI>) => {
  mediaProxy = proxy;
};
