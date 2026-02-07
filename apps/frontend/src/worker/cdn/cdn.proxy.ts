import * as Comlink from "comlink";
import type { CDNManager } from "./cdn.manager";

let worker: Worker | null = null;
let cdnProxy: Comlink.Remote<typeof CDNManager> | null = null;

/**
 * Gets a singleton proxy to the CDNManager running in the Web Worker.
 */
export const getCDNProxy = (): Comlink.Remote<typeof CDNManager> => {
  if (!cdnProxy) {
    worker = new Worker(new URL("./cdn.worker.ts", import.meta.url), {
      type: "module",
    });
    cdnProxy = Comlink.wrap<typeof CDNManager>(worker);
  }
  return cdnProxy;
};

/**
 * Helper to create a new instance of CDNManager in the worker.
 */
export const createCDNManager = async (): Promise<Comlink.Remote<CDNManager>> => {
  const ProxyClass = getCDNProxy();
  return await new ProxyClass();
};
