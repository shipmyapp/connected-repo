import { getActiveTeamIdForRequests } from "@frontend/utils/active_team_header.client";
import * as Comlink from "comlink";
import type { DataWorkerAPI } from "./data.worker";
import type { MediaWorkerAPI } from "./media.worker";
import { ProxyCell } from "./utils/ProxyCell";

let mediaWorker: Worker | null = null;
let dataWorker: Worker | null = null;

const mediaProxyCell = new ProxyCell<Comlink.Remote<MediaWorkerAPI>>();
const dataProxyCell = new ProxyCell<Comlink.Remote<DataWorkerAPI>>();

/**
 * Singleton proxy to the MediaWorker (thumbnail generation, CDN upload).
 * Lazily instantiated on first call.
 *
 * On spawn we seed the worker's `x-team-id` header cache from the main
 * thread's current value BEFORE resolving the proxy — the worker's realm
 * has its own copy of `active_team.ts` that starts empty, so any RPC that
 * left before this seed would miss the header and hit "Active team id
 * mismatch." on the backend.
 */
export const getMediaProxy = (): Promise<Comlink.Remote<MediaWorkerAPI>> => {
	if (mediaProxyCell.isInitial) {
		const worker = new Worker(new URL("./media.worker.ts", import.meta.url), {
			type: "module",
		});
		mediaWorker = worker;
		const proxy = Comlink.wrap<MediaWorkerAPI>(worker);
		void proxy.setActiveTeamId(getActiveTeamIdForRequests()).then(() => {
			mediaProxyCell.set(proxy);
		});
	}
	return mediaProxyCell.get();
};

/**
 * True once the MediaWorker has been spawned AND seeded. Used by team-switch
 * / logout paths to push updates only when the worker is warm — a cold
 * worker picks up the current value at spawn time.
 */
export const isMediaProxyReady = (): boolean => !mediaProxyCell.isInitial;

/**
 * Singleton proxy to the DataWorker (Dexie + sync orchestrator).
 *
 * On first call: spawns the worker, wraps with Comlink, and bridges the
 * MediaWorker proxy into it so the sync orchestrator can invoke CDN
 * operations directly (without hopping through the main thread every
 * time).
 */
export const getDataProxy = (): Promise<Comlink.Remote<DataWorkerAPI>> => {
	if (dataProxyCell.isInitial) {
		const worker = new Worker(new URL("./data.worker.ts", import.meta.url), {
			type: "module",
		});
		dataWorker = worker;
		const proxy = Comlink.wrap<DataWorkerAPI>(worker);
		dataProxyCell.set(proxy);
		// Bridge the media proxy into the data worker so the sync
		// orchestrator can invoke it without going through the main thread.
		getMediaProxy().then((media) => {
			proxy.setMediaProxy(Comlink.proxy(media));
		});
	}
	return dataProxyCell.get();
};

/**
 * Terminates all active worker singletons. Call on sign-out to release
 * resources; the workers will be re-spawned on next `getDataProxy()`.
 */
export const terminateWorkers = (): void => {
	if (mediaWorker) {
		mediaWorker.terminate();
		mediaWorker = null;
		mediaProxyCell.reset();
	}
	if (dataWorker) {
		dataWorker.terminate();
		dataWorker = null;
		dataProxyCell.reset();
	}
};
