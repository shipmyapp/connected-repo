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
 * Singleton proxy to the MediaWorker (thumbnail generation). Lazily
 * instantiated on first call.
 *
 * The proxy is resolved SYNCHRONOUSLY on spawn (previously it waited for an
 * active-team seed to resolve first, which meant an unhandled rejection could
 * leave the cell pending forever, and a terminate-during-seed race could
 * resolve a fresh cell with a dead worker). Ordering no longer matters: the
 * MediaWorker makes no RPCs of its own, so its `x-team-id` cache is vestigial —
 * we still seed it best-effort, but that never blocks proxy readiness.
 */
export const getMediaProxy = (): Promise<Comlink.Remote<MediaWorkerAPI>> => {
	if (mediaProxyCell.isInitial) {
		const worker = new Worker(new URL("./media.worker.ts", import.meta.url), {
			type: "module",
		});
		mediaWorker = worker;
		const proxy = Comlink.wrap<MediaWorkerAPI>(worker);
		mediaProxyCell.set(proxy);
		void proxy.setActiveTeamId(getActiveTeamIdForRequests()).catch((err) => {
			// biome-ignore lint/suspicious/noConsole: best-effort seed; never blocks readiness
			console.warn("[getMediaProxy] initial active-team seed failed", err);
		});
	}
	return mediaProxyCell.get();
};

/**
 * True once the MediaWorker has been spawned. Used by team-switch / logout
 * paths to push updates only when the worker is warm — a cold worker picks up
 * the current value at spawn time.
 */
export const isMediaProxyReady = (): boolean => !mediaProxyCell.isInitial;

/**
 * Singleton proxy to the DataWorker (Dexie + sync orchestrator).
 *
 * On first call: spawns the worker, wraps with Comlink, and wires a DIRECT
 * MessageChannel between the DataWorker and the MediaWorker so the sync /
 * upload pipeline can call `generateThumbnail` worker-to-worker, without every
 * call (and the file blob) round-tripping through the main thread. The main
 * thread only brokers the two ports once, at startup.
 */
export const getDataProxy = (): Promise<Comlink.Remote<DataWorkerAPI>> => {
	if (dataProxyCell.isInitial) {
		const worker = new Worker(new URL("./data.worker.ts", import.meta.url), {
			type: "module",
		});
		dataWorker = worker;
		const proxy = Comlink.wrap<DataWorkerAPI>(worker);
		dataProxyCell.set(proxy);
		// Broker a direct DataWorker⇄MediaWorker channel. `getMediaProxy()`
		// spawns the MediaWorker (and sets `mediaWorker`); we then hand one
		// port to each side.
		void getMediaProxy()
			.then(() => {
				if (!mediaWorker) return;
				const channel = new MessageChannel();
				mediaWorker.postMessage({ __connectMediaPort: channel.port2 }, [
					channel.port2,
				]);
				void proxy.connectMediaPort(
					Comlink.transfer(channel.port1, [channel.port1]),
				);
			})
			.catch((err) => {
				// biome-ignore lint/suspicious/noConsole: surface bridge-wiring failure in devtools
				console.warn("[getDataProxy] media bridge wiring failed", err);
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
