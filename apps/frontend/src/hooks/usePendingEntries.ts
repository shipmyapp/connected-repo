import { dataWorkerClient } from '@frontend/worker/worker.client';
import type { EntityName } from '@frontend/worker/worker.types';
import { useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useTableVersion } from './useWorkerStatus';
import { useEffect, useMemo } from 'react';

interface UseWorkerPendingParams<T> {
  entity: EntityName;
  sortBy?: string;
  descending?: boolean;
  limit?: number;
  offset?: number;
  /** Extra TanStack Query options forwarded to useQuery. */
  tanstackOptions?: Omit<UseQueryOptions<{ data: T[]; total: number }, Error>, 'queryKey' | 'queryFn'>;
}

/**
 * Hook to fetch pending entries for a given entity.
 * 
 * Automatically refetches when the 'pending_entries' table changes in the worker.
 */
export function usePendingEntries<T = unknown>({
  entity,
  sortBy,
  descending,
  limit,
  offset,
  tanstackOptions,
}: UseWorkerPendingParams<T>): UseQueryResult<{ data: T[]; total: number }, Error> {
  const queryClient = useQueryClient();
  const pendingVersion = useTableVersion('pending_entries');

  const queryKey = useMemo(() => 
    ['pending', entity, sortBy, descending, limit, offset].filter(v => v !== undefined),
    [entity, sortBy, descending, limit, offset]
  );

  // Reactively invalidate when pending items change
  useEffect(() => {
    if (pendingVersion > 0) {
      console.log(`[usePendingEntries] pending_entries changed (v${pendingVersion}), invalidating:`, queryKey);
      queryClient.invalidateQueries({ queryKey });
    }
  }, [pendingVersion, queryClient, queryKey]);

  return useQuery<{ data: T[]; total: number }, Error>({
    queryKey,
    queryFn: async () => {
      const result = await dataWorkerClient.getPending<T>({ 
        entity,
        sortBy,
        descending,
        limit,
        offset,
      });
      return { data: result.data, total: result.meta.total || result.data.length };
    },
    refetchOnWindowFocus: false,
    networkMode: 'always',
    ...tanstackOptions,
  });
}
