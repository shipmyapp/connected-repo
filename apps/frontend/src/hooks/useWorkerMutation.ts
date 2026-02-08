import { dataWorkerClient } from '@frontend/worker/worker.client';
import { queryClient } from '@frontend/utils/queryClient';
import type { EntityName } from '@frontend/worker/worker.types';
import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';

interface UseWorkerMutationParams<TData, TVariables> {
  entity: EntityName;
  operation: string;
  /** Query keys to invalidate on success. */
  invalidateKeys?: unknown[][];
  /** Extra TanStack Query options forwarded to useMutation. */
  tanstackOptions?: Omit<
    UseMutationOptions<TData, Error, TVariables>,
    'mutationFn'
  >;
}

/**
 * Drop-in replacement for `useMutation(orpc.*.mutationOptions())` that routes
 * mutations through the data Worker.
 */
export function useWorkerMutation<
  TData = unknown,
  TVariables = unknown,
>({
  entity,
  operation,
  invalidateKeys,
  tanstackOptions,
}: UseWorkerMutationParams<TData, TVariables>): UseMutationResult<TData, Error, TVariables> {
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables) => {
      const result = await dataWorkerClient.mutate<TData>({
        entity,
        operation,
        payload: variables as Record<string, unknown>,
      });
      return result.data;
    },
    onMutate: (variables) => {
      console.log(`[useWorkerMutation] Mutation starting: ${entity}.${operation}`, { variables });
    },
    onSuccess: (data, variables, context) => {
      console.log(`[useWorkerMutation] Mutation SUCCESS: ${entity}.${operation}`, { data });
      // Invalidate related queries
      if (invalidateKeys) {
        console.log(`[useWorkerMutation] Invalidating keys:`, invalidateKeys);
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      // Forward to user-provided onSuccess
      if (tanstackOptions?.onSuccess) {
        (tanstackOptions.onSuccess as (data: TData, variables: TVariables, context: unknown) => void)(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      console.error(`[useWorkerMutation] Mutation ERROR: ${entity}.${operation}`, error);
      if (tanstackOptions?.onError) {
        (tanstackOptions.onError as (error: Error, variables: TVariables, context: unknown) => void)(error, variables, context);
      }
    },
    onSettled: (data, error, variables, context) => {
      console.log(`[useWorkerMutation] Mutation SETTLED: ${entity}.${operation}`, { data, error });
      if (tanstackOptions?.onSettled) {
        (tanstackOptions.onSettled as (data: TData | undefined, error: Error | null, variables: TVariables, context: unknown) => void)(data, error, variables, context);
      }
    },
    ...tanstackOptions,
    networkMode: 'always',
  });
}
