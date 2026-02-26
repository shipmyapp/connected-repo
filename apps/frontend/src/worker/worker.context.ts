import * as Comlink from "comlink";
import type { MediaWorkerAPI } from "./media.worker";
import { ProxyCell } from "./utils/ProxyCell";

/**
 * This file serves as a BRIDGE context within the DataWorker.
 * 
 * ARCHITECTURAL NOTE:
 * 1. Why no dataWorkerProxy? 
 *    This code runs INSIDE the DataWorker. All DB managers are local imports. 
 *    A proxy to itself would be redundant.
 * 
 * 2. Why no swProxy (Service Worker)? 
 *    The DataWorker is a passive consumer of SW events via BroadcastChannel.
 *    It doesn't currently need to call any SW methods programmatically.
 * 
 * 3. Why mediaProxy?
 *    The SyncOrchestrator (in DataWorker) must actively trigger heavy tasks 
 *    (like thumbnail generation) in the MediaWorker. Since they are different 
 *    threads, we bridge the Comlink proxy from the Main Thread to here.
 */

const mediaProxyCell = new ProxyCell<Comlink.Remote<MediaWorkerAPI>>();

/**
 * Gets the bridged media worker proxy.
 * Used by SyncOrchestrator to trigger media processing.
 */
export const getMediaProxy = () => mediaProxyCell.get();

/**
 * Internal setter for the bridged media worker proxy.
 * Called by DataWorker.setMediaProxy during initialization.
 */
export const setMediaProxyInternal = (proxy: Comlink.Remote<MediaWorkerAPI>) => {
  mediaProxyCell.set(proxy);
};
