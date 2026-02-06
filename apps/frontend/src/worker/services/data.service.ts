import type { UserAppRouter } from '../../../../backend/src/routers/user_app/user_app.router';
import type { ConnectivityService } from './connectivity.service';
import type { StorageEngine, StorageRow } from '../stores/storage.engine';
import type { SyncManager } from './sync-manager.service';
import type { EntityName, WorkerPushEvent } from '../worker.types';
import { ulid } from 'ulid';

export class DataService {
  constructor(
    private storage: StorageEngine,
    private orpc: UserAppRouter,
    private connectivity: ConnectivityService,
    private syncManager: SyncManager,
    private broadcast: (event: WorkerPushEvent) => void,
  ) {}

  async query<T>(
    entity: EntityName, 
    operation: string, 
    payload?: unknown,
    options: { sortBy?: string; descending?: boolean; limit?: number; offset?: number } = {}
  ): Promise<{ data: T; source: 'server' | 'cache'; total?: number }> {
    // Entities managed by SyncManager (Real-time + Delta)
    const isSyncManaged = entity === 'leads';

    if (isSyncManaged) {
      const idFieldName = this.getIdFieldName(entity);
      
      let data: any;
      let total: number | undefined;

      if (operation === 'getById') {
        data = this.storage.getRow(entity, (payload as any)?.[idFieldName]);
      } else {
        const { sortBy, descending = true, limit, offset } = options;
        if (sortBy) {
          const allIds = this.storage.getSortedRowIds(entity, sortBy, descending);
          total = allIds.length;
          
          let pagedIds = allIds;
          if (offset !== undefined || limit !== undefined) {
             const start = offset || 0;
             const end = limit !== undefined ? start + limit : undefined;
             pagedIds = allIds.slice(start, end);
          }
          data = pagedIds.map(id => this.storage.getRow(entity, id));
        } else {
          data = this.storage.getAll(entity);
          total = data.length;
          
          if (offset !== undefined || limit !== undefined) {
             const start = offset || 0;
             const end = limit !== undefined ? start + limit : undefined;
             data = data.slice(start, end);
          }
        }
      }
      
      return { data: data as unknown as T, source: 'cache', total };
    }

    // Server-first (default for non-synced entities)
    if (this.connectivity.isOnline && this.connectivity.isServerReachable) {
      try {
        const entityRouter = this.orpc[entity as keyof UserAppRouter] as unknown as Record<string, (p: unknown) => Promise<T>>;
        const operationHandler = entityRouter[operation];
        if (!operationHandler) {
          throw new Error(`Unknown operation ${operation} for entity ${entity}`);
        }
        const result = await operationHandler(payload);
        
        // Update local cache but don't clear (since it's not full-sync managed)
        if (result && typeof result === 'object' && !Array.isArray(result)) {
           const id = this.getEntityId(entity, result);
           this.storage.setRow(entity, id, result as StorageRow);
        }

        return { data: result, source: 'server' };
      } catch (err) {
        console.error(`[DataService] Query failed for ${entity}.${operation} from server:`, err);
      }
    }

    // Generic Cache fallback
    if (operation === 'getAll') {
      return { data: this.storage.getAll(entity) as unknown as T, source: 'cache' };
    } else if (operation === 'getById') {
      const idFieldName = this.getIdFieldName(entity);
      const id = (payload as Record<string, unknown>)?.[idFieldName] as string | undefined;
      if (!id) throw new Error(`Missing ID for getById operation on ${entity}`);
      return { data: this.storage.getRow(entity, id) as unknown as T, source: 'cache' };
    }

    throw new Error(`Unsupported read operation: ${entity}.${operation} (Offline or Cache Empty)`);
  }


  async getPending<T>(
    entity: EntityName,
    options: { sortBy?: string; descending?: boolean; limit?: number; offset?: number } = {}
  ): Promise<{ data: T[]; total: number }> {
    console.log(`[DataService] Getting pending entries for ${entity}`, options);
    const allPending = this.storage.getAll('pending_entries');
    console.log(`[DataService] Total pending entries in storage: ${allPending.length}`);
    
    let filtered = allPending
      .filter(entry => entry.entity === entity)
      .map(entry => {
        try {
          if (typeof entry.payload !== 'string') return null;
          const parsed = JSON.parse(entry.payload);
          // Inject internal fields if needed, but usually payload is enough
          return parsed;
        } catch (e) {
          console.error(`[DataService] Failed to parse pending entry payload`, entry);
          return null;
        }
      })
      .filter(Boolean) as any[];

    const total = filtered.length;

    const { sortBy, descending = true, limit, offset } = options;
    if (sortBy) {
      filtered.sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];
        if (valA < valB) return descending ? 1 : -1;
        if (valA > valB) return descending ? -1 : 1;
        return 0;
      });
    }

    if (offset !== undefined || limit !== undefined) {
      const start = offset || 0;
      const end = limit !== undefined ? start + limit : undefined;
      filtered = filtered.slice(start, end);
    }

    console.log(`[DataService] Filtered pending entries for ${entity}: ${filtered.length} (Total: ${total})`);
    return { data: filtered as T[], total };
  }

  /**
   * getPendingById: Efficiently finds a specific pending entry by the ID 
   * contained within its JSON payload.
   */
  async getPendingById<T>(entity: EntityName, id: string): Promise<T | null> {
    const allPending = this.storage.getAll('pending_entries');
    const idField = this.getIdFieldName(entity);

    for (const entry of allPending) {
        if (entry.entity !== entity) continue;
        try {
            const payload = JSON.parse(entry.payload as string);
            if (payload[idField] === id) {
                return payload as T;
            }
        } catch (e) {
            console.error(`[DataService] Failed to parse payload for pending entry ${entry.id}`, e);
        }
    }
    return null;
  }

  async mutate<T>(entity: EntityName, operation: string, payload: unknown): Promise<{ data: T; source: 'server' | 'cache' }> {
    console.log(`[DataService] Mutating ${entity}.${operation}`, { payload });
    if (operation === 'create') {
      return this.handleCreate<T>(entity, payload as Record<string, unknown>);
    }

    // Strict Edit/Delete (Online-Only)
    if (!this.connectivity.isOnline || !this.connectivity.isServerReachable) {
      console.warn(`[DataService] Strict Edit Gatekeeping: Offline, blocking ${operation}`);
      throw new Error(`Cannot ${operation} while offline. Please check your connection.`);
    }

    // Perform server-first
    try {
      const entityRouter = this.orpc[entity as keyof UserAppRouter] as unknown as Record<string, (p: unknown) => Promise<T>>;
      const operationHandler = entityRouter[operation];
      if (!operationHandler) {
        throw new Error(`Unknown operation ${operation} for entity ${entity}`);
      }
      const result = await operationHandler(payload);
      console.log(`[DataService] Mutation ${entity}.${operation} success on server`, { result });

      // On success, update local store
      if (operation === 'delete') {
        const id = (payload as Record<string, unknown>)[this.getIdFieldName(entity)] as string;
        this.storage.delRow(entity, id);
      } else {
        const id = this.getEntityId(entity, result);
        this.storage.setRow(entity, id, result as StorageRow);
      }

      return { data: result, source: 'server' };
    } catch (err) {
      console.error(`[DataService] Mutation failed for ${entity}.${operation}:`, err);
      throw err;
    }
  }

  private async handleCreate<T>(entity: EntityName, payload: Record<string, unknown>): Promise<{ data: T; source: 'cache' }> {
    const start = Date.now();
    console.log(`[DataService] Starting handleCreate for ${entity}`);
    try {
      const idFieldName = this.getIdFieldName(entity);
      
      // Ensure payload has an ID for idempotency
      if (!payload[idFieldName]) {
        payload[idFieldName] = ulid();
        console.log(`[DataService] Generated new ID for create: ${payload[idFieldName]}`);
      }

      const entryId = ulid();
      const now = Date.now();

      const pendingRow = {
        id: entryId,
        entity,
        operation: 'create',
        payload: JSON.stringify(payload),
        status: 'pending',
        retryCount: 0,
        createdAt: now,
        nextRetryAt: 0,
      };

      console.log(`[DataService] Writing to pending_entries`, pendingRow);

      // Store in pending_entries
      this.storage.setRow('pending_entries', entryId, pendingRow);

      console.log(`[DataService] Write complete, triggering background sync. Time taken: ${Date.now() - start}ms`);

      // Trigger sync in the background — DO NOT await it here.
      // This allows the mutation to return immediately to the UI (optimistic),
      // while the SyncManager handles the server communication in the background.
      this.syncManager.sync().catch(err => {
        console.error(`[DataService] Background sync trigger failed:`, err);
      });

      return { data: payload as T, source: 'cache' };
    } catch (err) {
      console.error(`[DataService] handleCreate failed critically:`, err);
      throw err;
    }
  }

  private getEntityId(entity: EntityName, data: unknown): string {
    const idField = this.getIdFieldName(entity);
    return String((data as Record<string, unknown>)[idField]);
  }

  private getIdFieldName(entity: EntityName): string {
    switch (entity) {
      case 'leads': return 'leadId';
      // Add other entities here
      default: return 'id';
    }
  }
}
