import { ConnectivityService } from './services/connectivity.service';
import { createWorkerOrpcClient } from './services/orpc-worker.client';
import { SyncManager } from './services/sync-manager.service';
import { createAndStartPersister } from './stores/tinybase.persister';
import { createDataStore } from './stores/tinybase.store';
import { TinyBaseStorageEngine } from './stores/storage.engine';
import { DataService } from './services/data.service';
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerPushEvent,
} from './worker.types';

// ── State ───────────────────────────────────────────────────────────

let dataService: DataService | null = null;
let syncManager: SyncManager | null = null;
let connectivity: ConnectivityService | null = null;
let globalStore: any = null;
let globalStorage: TinyBaseStorageEngine | null = null;

// ── Broadcast helper ────────────────────────────────────────────────

function broadcast(event: WorkerPushEvent): void {
  console.log(`[Worker] Broadcasting push event: ${event.event}`, event.payload);
  self.postMessage(event);
}

// ── Message router ──────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  // 1. Initializer doesn't need dataService
  if (msg.type === 'init') {
    try {
      await initialize(msg.payload.apiUrl);
      respond(msg.correlationId, { success: true, data: { initialized: true }, meta: { source: 'cache' } });
    } catch (err) {
      respondError(msg.correlationId, err);
    }
    return;
  }

  // 2. Relays don't need dataService (they only need broadcast)
  if (msg.type === 'relay-event') {
    const { event, payload } = (msg as any).payload;
    console.log(`[Worker] Relaying event from SW: ${event}`, payload);
    
    if (event === 'sse-status-change' && connectivity) {
      connectivity.setSseStatus(payload.status);
    }

    broadcast({ type: 'push', event, payload } as any);
    return;
  }

  // 3. Strict initialization check for everything else
  if (!dataService || !syncManager) {
    respondError(msg.correlationId, new Error('Worker not initialized. Call init first.'));
    return;
  }

  try {
    if (msg.type === 'query') {
      const queryResult = await dataService.query(
        msg.entity, 
        msg.operation, 
        msg.payload, 
        { sortBy: msg.sortBy, descending: msg.descending, limit: msg.limit, offset: msg.offset }
      );
      respond(msg.correlationId, { 
        success: true, 
        data: queryResult.data, 
        meta: { source: queryResult.source, total: queryResult.total } 
      });
    } else if (msg.type === 'mutation') {
      const mutationResult = await dataService.mutate(msg.entity, msg.operation, msg.payload);
      respond(msg.correlationId, { success: true, data: mutationResult.data, meta: { source: mutationResult.source } });
    } else if (msg.type === 'get-pending') {
      const pendingResult = await dataService.getPending(
        msg.entity,
        { sortBy: msg.sortBy, descending: msg.descending, limit: msg.limit, offset: msg.offset }
      );
      respond(msg.correlationId, { 
        success: true, 
        data: pendingResult.data, 
        meta: { source: 'cache', total: pendingResult.total } 
      });
    } else if (msg.type === 'get-pending-by-id') {
      const pendingItem = await dataService.getPendingById(msg.entity, msg.id);
      respond(msg.correlationId, { success: true, data: pendingItem, meta: { source: 'cache' } });
    } else if (msg.type === 'force-sync') {
      const force = !!msg.payload?.force;
      syncManager.sync(force);
      respond(msg.correlationId, { success: true, data: { status: 'sync-started', force }, meta: { source: 'cache' } });
    } else if (msg.type === 'sync-update') {
      syncManager.applySyncEvent(msg.payload);
    } else if (msg.type === 'clear-cache' && globalStore) {
      console.log('[Worker] Nuking all tables in TinyBase store.');
      globalStore.delTables();
      respond(msg.correlationId, { success: true, data: { cleared: true }, meta: { source: 'cache' } });
    } else if (msg.type === 'get-pending-count' && globalStore) {
      const pendingIds = globalStore.getRowIds('pending_entries');
      respond(msg.correlationId, { success: true, data: { count: pendingIds.length }, meta: { source: 'cache' } });
    } else if (msg.type === 'get-sync-status' && connectivity && syncManager) {
      respond(msg.correlationId, { 
        success: true, 
        data: { 
          sseStatus: (connectivity as any)._sseStatus || 'disconnected',
          isOnline: (connectivity as any)._isOnline ?? true,
          // We don't have a direct syncProgress getter in syncManager yet, but we can send current state
        }, 
        meta: { source: 'cache' } 
      });
    } else if (msg.type === 'get-sync-meta' && globalStore) {
      const metaRows = globalStore.getTable('syncMeta');
      const meta: Record<string, string> = {};
      for (const [key, row] of Object.entries(metaRows)) {
        meta[key] = (row as any).value;
      }
      respond(msg.correlationId, { success: true, data: meta, meta: { source: 'cache' } });
    } else if (msg.type === 'update-user-meta' && globalStore) {
      const { userId, userEmail } = msg.payload;
      globalStore.setRow('syncMeta', 'userId', { value: userId });
      globalStore.setRow('syncMeta', 'userEmail', { value: userEmail });
      respond(msg.correlationId, { success: true, data: { updated: true }, meta: { source: 'cache' } });
    } else {
      respondError((msg as any).correlationId, new Error(`Unknown message type: ${(msg as any).type}`));
    }
  } catch (err) {
    respondError(msg.correlationId, err);
  }
};

// ── Init ────────────────────────────────────────────────────────────

async function initialize(apiUrl: string): Promise<void> {
  if (dataService) return; // Already initialized

  const store = createDataStore();
  globalStore = store;
  await createAndStartPersister(store);

  const storage = new TinyBaseStorageEngine(store);
  globalStorage = storage;
  connectivity = new ConnectivityService(broadcast);
  connectivity.start();

  const orpc = createWorkerOrpcClient(apiUrl, broadcast);

  syncManager = new SyncManager(storage, orpc, connectivity, broadcast);
  dataService = new DataService(storage, orpc, connectivity, syncManager, broadcast);

  // Broadcaster for reactive UI updates. By listening to the store directly,
  // we ensure that ANY change (from sync OR local mutations) is immediately
  // reflected in the React UI via 'table-changed' push events.
  store.addTableListener(null, (_store, tableId) => {
    console.log(`[Worker] Table '${tableId}' changed, broadcasting reactive update.`);
    broadcast({
      type: 'push',
      event: 'table-changed',
      payload: { table: tableId },
    });
  });

  // Attempt to sync any pending items & start live stream
  syncManager.start().catch(err => console.error('[Worker] Initial sync/live-sync failed:', err));
}

// ── Response helpers ────────────────────────────────────────────────

function respond(
  correlationId: string,
  body: { success: true; data: unknown; meta: { source: 'server' | 'cache'; total?: number } },
): void {
  const msg: WorkerResponse = {
    correlationId,
    type: 'response',
    ...body,
  };
  self.postMessage(msg);
}

function respondError(correlationId: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  const msg: WorkerResponse = {
    correlationId,
    type: 'response',
    success: false,
    error: { message, code },
  };
  self.postMessage(msg);
}
