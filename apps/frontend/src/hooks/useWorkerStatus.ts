import { dataWorkerClient } from '@frontend/worker/worker.client';
import type { WorkerPushEvent } from '@frontend/worker/worker.types';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

interface WorkerStatus {
  isOnline: boolean;
  syncProgress: {
    pending: number;
    inFlight: number;
    completed: number;
    failed: number;
  } | null;
  tables: Record<string, number>;
  sseStatus: 'connected' | 'disconnected' | 'connecting';
  lastEvent: WorkerPushEvent | null;
}

// ── Module-level snapshot (shared by all subscribers) ────────────────

let snapshot: WorkerStatus = {
  isOnline: navigator.onLine,
  syncProgress: null,
  tables: {},
  sseStatus: 'disconnected',
  lastEvent: null,
};

const listeners = new Set<() => void>();
const eventListeners = new Set<(event: WorkerPushEvent) => void>();

function emitChange(): void {
  for (const l of listeners) l();
}

/**
 * Update snapshot and notify listeners.
 */
function updateSnapshot(updates: Partial<WorkerStatus>, event: WorkerPushEvent): void {
  const hasUpdates = Object.keys(updates).length > 0;
  
  if (hasUpdates) {
    snapshot = {
      ...snapshot,
      ...updates,
      lastEvent: event,
    };
  } else {
    // Even if no state updates, we update lastEvent if provided
    snapshot = {
      ...snapshot,
      lastEvent: event,
    };
  }
  
  // Notify side-effect listeners
  for (const l of eventListeners) {
    try {
      l(event);
    } catch (err) {
      console.error('[useWorkerStatus] Event listener error:', err);
    }
  }

  // Only notify external store listeners if state actually changed
  if (hasUpdates) {
    emitChange();
  }
}

function isSyncProgressEqual(a: WorkerStatus['syncProgress'], b: WorkerStatus['syncProgress']): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.pending === b.pending && a.inFlight === b.inFlight && a.completed === b.completed && a.failed === b.failed;
}

// Subscribe to Worker push events once
let subscribed = false;
export function ensureSubscription(): void {
  if (subscribed) return;
  subscribed = true;

  console.log('[useWorkerStatus] Initializing worker event subscription...');

  // Fetch initial status from worker to avoid race conditions with bridged events
  dataWorkerClient.getSyncStatus().then(status => {
    console.log('[useWorkerStatus] Initial sync status fetched:', status);
    updateSnapshot(status, { type: 'push', event: 'connectivity-change', payload: { ...status, isServerReachable: status.sseStatus === 'connected' } } as any);
  }).catch(err => {
    console.warn('[useWorkerStatus] Failed to fetch initial sync status:', err);
  });

  dataWorkerClient.onPushEvent((event) => {
    switch (event.event) {
      case 'connectivity-change':
        // console.log(`[useWorkerStatus] connectivity-change:`, event.payload);
        if (snapshot.isOnline !== event.payload.isOnline) {
          updateSnapshot({ isOnline: event.payload.isOnline }, event);
        } else {
          updateSnapshot({}, event);
        }
        break;
      case 'sync-progress':
        if (!isSyncProgressEqual(snapshot.syncProgress, event.payload)) {
          updateSnapshot({ syncProgress: event.payload }, event);
        } else {
          updateSnapshot({}, event);
        }
        break;
      case 'sync-complete':
        updateSnapshot({
          syncProgress: snapshot.syncProgress
            ? { ...snapshot.syncProgress, pending: 0, inFlight: 0 }
            : null,
        }, event);
        break;
      case 'sync-error':
        updateSnapshot({}, event);
        break;
      case 'table-changed':
        updateSnapshot({
          tables: {
            ...snapshot.tables,
            [event.payload.table]: (snapshot.tables[event.payload.table] || 0) + 1,
          },
        }, event);
        break;
      case 'auth-expired':
        updateSnapshot({}, event);
        break;
      case 'sse-status-change':
        console.log(`[useWorkerStatus] sse-status-change (PUSH): ${event.payload.status}`);
        if (snapshot.sseStatus !== event.payload.status) {
          updateSnapshot({ sseStatus: event.payload.status }, event);
        } else {
          updateSnapshot({}, event);
        }
        break;
    }
  });
}

// Start subscription as soon as the module is loaded to avoid missing early events
if (typeof window !== 'undefined') {
  ensureSubscription();
}

/**
 * Returns the whole snapshot.
 * @deprecated Use granular hooks to minimize re-renders. This hook still re-renders
 * on EVERY worker event because it returns the whole snapshot object.
 */
export function useWorkerStatus(): WorkerStatus {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => snapshot, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook to listen for worker events without triggering a re-render.
 */
export function useWorkerEvent(
  eventType: WorkerPushEvent['event'] | '*',
  callback: (event: WorkerPushEvent) => void
): void {
  useEffect(() => {
    const listener = (event: WorkerPushEvent) => {
      if (eventType === '*' || event.event === eventType) {
        callback(event);
      }
    };
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  }, [eventType, callback]);
}

/**
 * Granular hook for online status. Only re-renders when isOnline changes.
 */
export function useIsOnline(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => snapshot.isOnline, []);
  
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Granular hook for SSE status. Only re-renders when sseStatus changes.
 */
export function useSseStatus(): WorkerStatus['sseStatus'] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => snapshot.sseStatus, []);
  
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Granular hook for sync progress. Re-renders when syncProgress OR its properties change.
 */
export function useSyncProgress(): WorkerStatus['syncProgress'] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => snapshot.syncProgress, []);
  
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Granular hook for a specific table's version. Only re-renders when THAT table changes.
 */
export function useTableVersion(entity: string): number {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => snapshot.tables[entity] || 0, [entity]);
  
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
