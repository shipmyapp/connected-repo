import { dataWorkerClient } from '@frontend/worker/worker.client';
import type { EntityName } from '@frontend/worker/worker.types';
import { useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useTableVersion } from './useWorkerStatus';

interface UseWorkerQueryParams<T> {
  entity: EntityName;
  operation: string;
  payload?: Record<string, unknown>;
  sortBy?: string;
  descending?: boolean;
  limit?: number;
  offset?: number;
  /** Override the default query key. Defaults to [entity, operation, payload, sortBy, descending, limit, offset]. */
  queryKey?: unknown[];
  /** Extra TanStack Query options forwarded to useQuery. */
  tanstackOptions?: Omit<UseQueryOptions<{ data: T; meta: { source: 'server' | 'cache'; total?: number } }, Error>, 'queryKey' | 'queryFn'>;
}

/**
 * Drop-in replacement for `useQuery(orpc.*.queryOptions())` that routes
 * reads through the data Worker (server-first with local cache fallback).
 *
 * Automatically refetches when the underlying database table changes.
 */
export function useWorkerQuery<T = unknown>({
  entity,
  operation,
  payload,
  sortBy,
  descending,
  limit,
  offset,
  queryKey,
  tanstackOptions,
}: UseWorkerQueryParams<T>): UseQueryResult<{ data: T; meta: { source: 'server' | 'cache'; total?: number } }, Error> {
  const queryClient = useQueryClient();
  const tableVersion = useTableVersion(entity);

  // Memoize the query key to prevent infinite re-render loops in the useEffect below.
  // We use JSON.stringify on the payload to ensure stability even if a new object is passed.
  const serializedPayload = JSON.stringify(payload);
  const key = useMemo(() => 
    queryKey ?? [entity, operation, payload, sortBy, descending, limit, offset].filter(v => v !== undefined),
    [queryKey, entity, operation, serializedPayload, sortBy, descending, limit, offset]
  );

  // Automatically invalidate when database table changes
  useEffect(() => {
    if (tableVersion > 0) {
      console.log(`[useWorkerQuery] Table ${entity} changed (v${tableVersion}), invalidating query:`, key);
      queryClient.invalidateQueries({ queryKey: key });
    }
  }, [tableVersion, entity, queryClient, key]);

  return useQuery<{ data: T; meta: { source: 'server' | 'cache'; total?: number } }, Error>({
    queryKey: key,
    queryFn: async () => {
      const result = await dataWorkerClient.query<T>({
        entity,
        operation,
        payload,
        sortBy,
        descending,
        limit,
        offset,
      });
      return { data: result.data, meta: result.meta };
    },
    staleTime: 5000,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    ...tanstackOptions,
  });
}
