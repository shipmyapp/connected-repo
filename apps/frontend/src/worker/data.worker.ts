import { ConnectivityService } from './services/connectivity.service';
import { MediaService } from './services/media.service';
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
let mediaService: MediaService | null = null;
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
    const type = msg.type;
    
    switch (type) {
      case 'query': {
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
        break;
      }
      case 'mutation': {
        if (msg.entity === 'uploads') {
          // Special handling for media uploads via worker mutation
          console.log('[DataWorker] Handling upload mutation:', msg.payload);
          const { localUrl, fileType, fileName, leadId, field } = msg.payload as any;
          if (mediaService) {
            console.log('[DataWorker] Calling mediaService.queueUpload with:', { fileType, fileName, leadId, field });
            const uploadId = await mediaService.queueUpload(localUrl, fileType, fileName, leadId, field);
            console.log('[DataWorker] Upload queued successfully with ID:', uploadId);
            respond(msg.correlationId, { success: true, data: { uploadId }, meta: { source: 'cache' } });
          } else {
            console.error('[DataWorker] Media service not initialized!');
            respondError(msg.correlationId, new Error('Media service not initialized'));
          }
        } else {
          const mutationResult = await dataService.mutate(msg.entity, msg.operation, msg.payload);
          respond(msg.correlationId, { success: true, data: mutationResult.data, meta: { source: mutationResult.source } });
        }
        break;
      }
      case 'get-pending': {
        const pendingResult = await dataService.getPending(
          msg.entity,
          { sortBy: msg.sortBy, descending: msg.descending, limit: msg.limit, offset: msg.offset }
        );
        respond(msg.correlationId, { 
          success: true, 
          data: pendingResult.data, 
          meta: { source: 'cache', total: pendingResult.total } 
        });
        break;
      }
      case 'get-pending-by-id': {
        const pendingItem = await dataService.getPendingById(msg.entity, msg.id);
        respond(msg.correlationId, { success: true, data: pendingItem, meta: { source: 'cache' } });
        break;
      }
      case 'force-sync': {
        const force = !!msg.payload?.force;
        syncManager.sync(force);
        respond(msg.correlationId, { success: true, data: { status: 'sync-started', force }, meta: { source: 'cache' } });
        break;
      }
      case 'sync-update': {
        syncManager.applySyncEvent(msg.payload);
        break;
      }
      case 'clear-cache': {
        if (globalStore) {
          console.log('[Worker] Nuking all tables in TinyBase store.');
          globalStore.delTables();
          respond(msg.correlationId, { success: true, data: { cleared: true }, meta: { source: 'cache' } });
        }
        break;
      }
      case 'get-pending-count': {
        if (globalStore) {
          const pendingIds = globalStore.getRowIds('pending_entries');
          respond(msg.correlationId, { success: true, data: { count: pendingIds.length }, meta: { source: 'cache' } });
        }
        break;
      }
      case 'get-sync-status': {
        if (connectivity && syncManager) {
          respond(msg.correlationId, { 
            success: true, 
            data: { 
              sseStatus: (connectivity as any)._sseStatus || 'disconnected',
              isOnline: (connectivity as any)._isOnline ?? true,
            }, 
            meta: { source: 'cache' } 
          });
        }
        break;
      }
      case 'get-sync-meta': {
        if (globalStore) {
          const metaRows = globalStore.getTable('syncMeta');
          const meta: Record<string, string> = {};
          for (const [key, row] of Object.entries(metaRows)) {
            meta[key] = (row as any).value;
          }
          respond(msg.correlationId, { success: true, data: meta, meta: { source: 'cache' } });
        }
        break;
      }
      case 'update-user-meta': {
        if (globalStore) {
          const { userId, userEmail } = msg.payload;
          globalStore.setRow('syncMeta', 'userId', { value: userId });
          globalStore.setRow('syncMeta', 'userEmail', { value: userEmail });
          respond(msg.correlationId, { success: true, data: { updated: true }, meta: { source: 'cache' } });
        }
        break;
      }
      default:
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

  mediaService = new MediaService(store, orpc);
  
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
  
  // Also start media upload processing if online
  if (navigator.onLine && mediaService) {
    mediaService.processPendingUploads().catch(console.error);
  }
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
