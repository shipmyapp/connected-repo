import * as Comlink from "comlink";
import type { AppWorkerAPI } from "./app.worker";

let worker: Worker | null = null;
let appProxy: Comlink.Remote<AppWorkerAPI> | null = null;

/**
 * Gets a singleton proxy to the consolidated AppWorker running in the background.
 */
export const getAppProxy = (): Comlink.Remote<AppWorkerAPI> => {
  if (!appProxy) {
    worker = new Worker(new URL("./app.worker.ts", import.meta.url), {
      type: "module",
    });
    appProxy = Comlink.wrap<AppWorkerAPI>(worker);
  }
  return appProxy;
};
