import type * as Comlink from "comlink";
import { useCallback, useEffect, useState } from "react";
import type { DataWorkerAPI } from "../../data.worker";
import { getDataProxy } from "../../worker.proxy";
import type { AppDbTable } from "../db.manager";

interface UseLocalDbResult<T> {
	data: T | undefined;
	isLoading: boolean;
	error: Error | null;
	refetch: () => Promise<void>;
}

/**
 * Reactive hook backed by the local Dexie DB. Fetches once on mount,
 * then re-fetches on every `BroadcastChannel("db-updates")` message
 * whose `table` matches the one this hook is watching.
 *
 * The DataWorker (which owns Dexie) posts to the channel after every
 * write via `notifySubscribers`. This hook — running on the main thread
 * — receives those messages and re-runs the fetch through the Comlink
 * proxy.
 *
 * `deps` mirrors React's rules-of-hooks convention — include any
 * captured values inside `fetchFn`. The `proxy` argument is a
 * `Comlink.Remote<DataWorkerAPI>` — every method call is async, so
 * `await` them in the fetch closure.
 */
export function useLocalDb<T>(
	tableName: AppDbTable,
	fetchFn: (proxy: Comlink.Remote<DataWorkerAPI>) => Promise<T>,
	// biome-ignore lint/suspicious/noExplicitAny: dep array mirrors React's own type
	deps: any[] = [],
): UseLocalDbResult<T> {
	const [data, setData] = useState<T | undefined>(undefined);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<Error | null>(null);

	const fetchData = useCallback(async () => {
		try {
			const proxy = await getDataProxy();
			const result = await fetchFn(proxy);
			setData(result);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setIsLoading(false);
		}
		// biome-ignore lint/correctness/useExhaustiveDependencies: deps is intentionally a caller-provided list — this hook's whole point is dynamic dependency injection
	}, deps);

	useEffect(() => {
		fetchData();
		const channel = new BroadcastChannel("db-updates");
		const handler = (event: MessageEvent) => {
			if ((event.data as { table?: string } | undefined)?.table === tableName) {
				fetchData();
			}
		};
		channel.addEventListener("message", handler);
		return () => {
			channel.removeEventListener("message", handler);
			channel.close();
		};
	}, [tableName, fetchData]);

	return { data, isLoading, error, refetch: fetchData };
}
