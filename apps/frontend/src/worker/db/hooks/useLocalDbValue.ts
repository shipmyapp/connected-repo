import { useEffect, useState, useCallback, useRef } from 'react';
import type { AppDbTable } from '../db.manager';

export function useLocalDbValue<T>(tableName: AppDbTable, fetchFn: () => Promise<T>, initialValue: T, deps: any[] = []) {
  const [data, setData] = useState<T>(initialValue);
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
      console.error(`[useLocalDbValue] Failed to fetch value for ${tableName}:`, err);
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
  }, [tableName, fetchData, ...deps]);

  return { data, isLoading, error, refetch: fetchData };
}