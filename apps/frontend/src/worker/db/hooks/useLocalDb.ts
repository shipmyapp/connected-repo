import { useEffect, useState, useCallback, useRef } from 'react';
import type { AppDbTable } from '../db.manager';

/**
 * A reactive hook that fetches data from a local Dexie DB and listens for updates via BroadcastChannel.
 */
export function useLocalDb<T>(tableName: AppDbTable, fetchFn: () => Promise<T[]>, deps: any[] = []) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      console.error(`[useLocalDb] Failed to fetch data for ${tableName}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [tableName]);

  useEffect(() => {
    // Initial fetch & fetch on deps change
    fetchData();

    // Listen for DB updates
    const dbUpdatesChannel = new BroadcastChannel("db-updates");
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.table === tableName) {
        console.debug(`[useLocalDb] Table ${tableName} updated, re-fetching...`);
        fetchData();
      }
    };

    dbUpdatesChannel.addEventListener('message', handleMessage);

    return () => {
      dbUpdatesChannel.removeEventListener('message', handleMessage);
      dbUpdatesChannel.close();
    };
  }, [tableName, fetchData, ...deps]);

  return { data, isLoading, error, refetch: fetchData };
}