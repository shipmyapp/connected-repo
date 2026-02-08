import { dataWorkerClient } from '@frontend/worker/worker.client';
import type { EntityName } from '@frontend/worker/worker.types';
import { useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useTableVersion } from './useWorkerStatus';
import { useEffect } from 'react';

interface UsePendingEntryParams<T> {
  entity: EntityName;
  id: string;
  /** Extra TanStack Query options forwarded to useQuery. */
  tanstackOptions?: Omit<UseQueryOptions<T | null, Error>, 'queryKey' | 'queryFn'>;
}

/**
 * Hook to fetch a specific pending entry by its internal payload ID.
 * 
 * Automatically refetches when the 'pending_entries' table changes.
 */
export function usePendingEntry<T = unknown>({
  entity,
  id,
  tanstackOptions,
}: UsePendingEntryParams<T>): UseQueryResult<T | null, Error> {
  const queryClient = useQueryClient();
  const pendingVersion = useTableVersion('pending_entries');

  const queryKey = ['pending', entity, id];

  // Reactively invalidate when pending items change
  useEffect(() => {
    if (pendingVersion > 0) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [pendingVersion, queryClient]);

  return useQuery<T | null, Error>({
    queryKey,
    queryFn: async () => {
      const result = await dataWorkerClient.getPendingById<T>({ entity, id });
      return result.data;
    },
    refetchOnWindowFocus: false,
    networkMode: 'always',
    ...tanstackOptions,
  });
}
