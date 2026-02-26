import { useEffect, useState, useCallback, useRef } from 'react';
import type { AppDbTable } from '../db.manager';
import type { DataWorkerAPI } from '../../data.worker';
import type { Remote } from 'comlink';
import { getDataProxy } from '../../worker.proxy';

/**
 * A reactive hook that fetches a single item from a local Dexie DB and listens for updates via BroadcastChannel.
 */
export function useLocalDbItem<T>(tableName: AppDbTable, fetchFn: (app: Remote<DataWorkerAPI>) => Promise<T | undefined>) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const app = await getDataProxy();
      const result = await fetchFnRef.current(app);
      setData(result);
      setError(null);
    } catch (err) {
      console.error(`[useLocalDbItem] Failed to fetch item for ${tableName}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [tableName]);

  useEffect(() => {
    fetchData();

    const dbUpdatesChannel = new BroadcastChannel("db-updates");
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.table === tableName) {
        fetchData();
      }
    };

    dbUpdatesChannel.addEventListener('message', handleMessage);

    return () => {
      dbUpdatesChannel.removeEventListener('message', handleMessage);
      dbUpdatesChannel.close();
    };
  }, [tableName, fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
