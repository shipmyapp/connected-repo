import { dataWorkerClient } from '@frontend/worker/worker.client';
import { useIsOnline, useSseStatus, useSyncProgress } from './useWorkerStatus';
import { useMemo } from 'react';

interface SyncProgress {
  pending: number;
  inFlight: number;
  completed: number;
  failed: number;
}

interface SyncManager {
  sync: () => Promise<void>;
  isSyncing: boolean;
}

/**
 * Hook to access worker sync state and actions.
 */
export function useWorkerSync(): { 
  syncProgress?: SyncProgress | null; 
  syncManager: SyncManager;
  isOnline: boolean;
  sseStatus: 'connected' | 'disconnected' | 'connecting';
} {
  const syncProgress = useSyncProgress();
  const isOnline = useIsOnline();
  const sseStatus = useSseStatus();

  return useMemo(() => {
    const isSyncing = (syncProgress?.inFlight || 0) > 0;

    return {
      syncProgress,
      isOnline,
      sseStatus,
      syncManager: {
        sync: async () => {
          await dataWorkerClient.forceSync();
        },
        isSyncing,
      },
    };
  }, [syncProgress, isOnline, sseStatus]);
}