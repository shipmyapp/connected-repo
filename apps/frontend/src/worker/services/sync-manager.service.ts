import type { UserAppRouter } from '../../../../backend/src/routers/user_app/user_app.router';
import { calculateBackoff } from '../utils/backoff.utils';
import type {
  EntityName,
  PendingQueueEntry,
  SyncCompleteEvent,
  SyncErrorEvent,
  SyncProgressEvent,
  WorkerPushEvent,
} from '../worker.types';
import type { ConnectivityService } from './connectivity.service';
import type { StorageEngine } from '../stores/storage.engine';
import { isAuthError } from '../utils/orpc_interceptor_error.utils';

const MAX_RETRIES = 5;

export class SyncManager {
  private _isSyncing = false;
  private _isAuthFailed = false;

  constructor(
    private _storage: StorageEngine,
    private _orpc: UserAppRouter,
    private _connectivity: ConnectivityService,
    private _broadcast: (event: WorkerPushEvent) => void,
  ) {
    // Auto-sync when connectivity is restored. This proactive approach ensures
    // that background changes are synced as soon as the pipe is open again,
    // rather than waiting for a user action.
    this._connectivity.onStatusChange((status) => {
      console.log(`[SyncManager] Connectivity change detected: online=${status.isOnline}, reachable=${status.isServerReachable}`);
      if (status.isOnline && status.isServerReachable) {
        console.log(`[SyncManager] Reconnection detected, triggering auto-sync.`);
        this.sync().catch(err => console.error('[SyncManager] Auto-sync failed:', err));
        this.performInitialSync().catch(err => console.error('[SyncManager] Delta sync failed:', err));
      }
    });
  }

  async start(): Promise<void> {
     await this.performInitialSync();
  }

  async performInitialSync(): Promise<void> {
    if (this._isAuthFailed) {
      console.log(`[SyncManager] Skipping initial sync due to previous auth failure.`);
      return;
    }
    const { isOnline, isServerReachable } = this._connectivity;
    if (!isOnline || !isServerReachable) {
      console.log(`[SyncManager] Initial sync deferred: online=${isOnline}, reachable=${isServerReachable}`);
      return;
    }

    try {
      console.log(`[SyncManager] Starting initial delta sync...`);
      
      // 1. Get the last sync timestamp from storage
      let lastSyncTimestamp: string | number | undefined;
      const syncMetaRow = this._storage.getRow('syncMeta', 'lastSyncTimestamp');
      if (syncMetaRow) {
        lastSyncTimestamp = syncMetaRow.value as string;
      }

      // 2. Fallback: if no metadata, scan tables (legacy support)
      if (!lastSyncTimestamp) {
        console.log(`[SyncManager] No syncMeta found. Scanning tables for latest updatedAt...`);
        let latestUpdate = 0;
        const tables: EntityName[] = ['journalEntries', 'prompts'];
        for (const table of tables) {
          const rows = this._storage.getAll(table);
          for (const row of rows) {
            if (!row.updatedAt) continue;
            const updatedAt = new Date(row.updatedAt as string).getTime();
            if (!isNaN(updatedAt) && updatedAt > latestUpdate) {
              latestUpdate = updatedAt;
            }
          }
        }
        lastSyncTimestamp = latestUpdate;
      }

      console.log(`[SyncManager] Fetching delta since: ${lastSyncTimestamp === 0 ? 'NEVER' : lastSyncTimestamp}`);
      
      const delta = await (this._orpc.sync as any).getDelta({ since: lastSyncTimestamp });
      console.log(`[SyncManager] Delta received:`, {
        journalEntries: delta.journalEntries?.length ?? 0,
        prompts: delta.prompts?.length ?? 0,
        newTimestamp: delta.timestamp
      });
      
      this._storage.transaction(() => {
        // Update journalEntries
        if (delta.journalEntries) {
          for (const entry of delta.journalEntries) {
            if (entry.deletedAt) {
              console.log(`[SyncManager] Deleting soft-deleted journal entry: ${entry.journalEntryId}`);
              this._storage.delRow('journalEntries', entry.journalEntryId);
            } else {
              this._storage.setRow('journalEntries', entry.journalEntryId, entry);
            }
          }
        }
        // Update prompts
        if (delta.prompts) {
          for (const prompt of delta.prompts) {
            if (prompt.deletedAt) {
              console.log(`[SyncManager] Deleting soft-deleted prompt: ${prompt.promptId}`);
              this._storage.delRow('prompts', prompt.promptId.toString());
            } else {
              this._storage.setRow('prompts', prompt.promptId.toString(), prompt);
            }
          }
        }

        // Store the new timestamp for the next sync
        if (delta.timestamp) {
           this._storage.setRow('syncMeta', 'lastSyncTimestamp', { value: delta.timestamp });
        }
      });
      
      console.log(`[SyncManager] Initial delta sync completed.`);
      this._isAuthFailed = false; 
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (isAuthError(err)) {
        this._isAuthFailed = true;
      }
      console.error(`[SyncManager] Initial delta sync failed:`, err);
    }
  }

  applySyncEvent(event: any): void {
    console.log(`[SyncManager] Applying sync event from SW:`, event);
    const { type, operation, data } = event;
    const items = Array.isArray(data) ? data : [data];
    const idField = this.getIdFieldName(type);

    this._storage.transaction(() => {
      for (const item of items) {
        const id = item[idField];
        if (!id) {
          console.warn(`[SyncManager] Missing ID field ${idField} in sync data`, item);
          continue;
        }

        // Handle both explicit delete operation AND soft-deleted tombstones (deletedAt)
        if (operation === 'delete' || item.deletedAt) {
          console.log(`[SyncManager] Processing deletion for ${type}:${id}`);
          this._storage.delRow(type as EntityName, id.toString());
        } else {
          this._storage.setRow(type as EntityName, id.toString(), item);
        }
      }
    });
  }

  /** Trigger a sync pass — drains the pending queue oldest-first. */
  async sync(force = false): Promise<void> {
    console.log(`[SyncManager] Sync triggered (force: ${force}). isSyncing: ${this._isSyncing}, isAuthFailed: ${this._isAuthFailed}`);
    if (this._isSyncing) return;
    if (this._isAuthFailed && !force) {
      console.log(`[SyncManager] Skipping sync pass due to auth failure.`);
      return;
    }
    this._isSyncing = true;

    try {
      // Safety: find any items stuck in 'in-flight' from a previous crash/shutdown
      // This ensures that even if the worker or browser crashed mid-sync, the operations
      // aren't lost and will be retried in the next pass.
      this._sanitizeQueue();

      // The core sync logic is decoupled into _drainQueue to allow for different
      // triggering strategies (automatic vs forced).
      await this._drainQueue(force);
    } catch (err) {
      console.error(`[SyncManager] Critical drain failure:`, err);
    } finally {
      this._isSyncing = false;
      this._emitProgress(); // Final update to clear UI spinners
      console.log(`[SyncManager] Sync pass finished.`);
    }
  }

  /** Convert orphaned 'in-flight' items back to 'pending'. */
  private _sanitizeQueue(): void {
    const all = this._storage.getAll('pending_entries') as unknown as PendingQueueEntry[];
    let fixed = 0;
    for (const row of all) {
      if (row.status === 'in-flight') {
        this._storage.setRow('pending_entries', row.id, { ...row, status: 'pending' });
        fixed++;
      }
    }
    if (fixed > 0) console.log(`[SyncManager] Sanitized ${fixed} orphaned 'in-flight' entries.`);
  }

  private async _drainQueue(force: boolean): Promise<void> {
    const rowIds = this._storage.getSortedRowIds('pending_entries', 'createdAt', false);
    console.log(`[SyncManager] _drainQueue: Found ${rowIds.length} rowIds:`, rowIds);
    if (rowIds.length === 0) {
      const allRows = this._storage.getAll('pending_entries');
      console.log(`[SyncManager] Verification: Total rows in pending_entries (non-sorted): ${allRows.length}`);
      return;
    }

    let syncedCount = 0;

    for (const rowId of rowIds) {
      console.log(`[SyncManager] Processing rowId: ${rowId}`);
      const row = this._storage.getRow('pending_entries', rowId);
      if (!row) {
        console.warn(`[SyncManager] Row ${rowId} unexpectedly missing during drain`);
        continue;
      }

      const status = row.status as string;
      const nextRetryAt = row.nextRetryAt as number;

      // Skip items that aren't due yet, UNLESS we are forcing a sync
      // Also skip items that have explicitly failed, UNLESS we are forcing a sync
      if (!force && (status === 'failed' || (status === 'pending' && nextRetryAt > Date.now()))) {
        console.log(`[SyncManager] Skipping row ${rowId} (status: ${status}, nextRetryAt: ${nextRetryAt})`);
        continue;
      }

      // Check connectivity before each item
      if (!this._connectivity.isOnline || !this._connectivity.isServerReachable) {
        console.log(`[SyncManager] Connectivity lost. Stopping drain. online: ${this._connectivity.isOnline}, reachable: ${this._connectivity.isServerReachable}`);
        break; // Stop draining — we're offline
      }

      console.log(`[SyncManager] Syncing row ${rowId}`, row);

      try {
        // Mark as in-flight INSIDE the try to ensure cleanup/retry on any failure
        this._storage.setRow('pending_entries', rowId, { ...row, status: 'in-flight' });
        this._emitProgress();

        const entity = row.entity as EntityName;
        const operation = row.operation as string;
        const payload = JSON.parse(row.payload as string);

        console.log(`[SyncManager] Executing ${entity}.${operation} on server...`);
        const entityRouter = this._orpc[entity as keyof UserAppRouter] as unknown as Record<string, (p: unknown) => Promise<any>>;
        const operationHandler = entityRouter?.[operation];
        
        if (!operationHandler) {
          throw new Error(`Unknown operation ${operation} for entity ${entity}`);
        }

        const serverResult = await operationHandler(payload);
        console.log(`[SyncManager] Server response for ${rowId}:`, serverResult);

        // On success: update local record in the main table
        if (serverResult) {
          const idFieldName = this.getIdFieldName(entity);
          const jeId = (serverResult as Record<string, unknown>)[idFieldName] as string;
          console.log(`[SyncManager] Updating local table ${entity} for ID ${jeId}`);
          this._storage.setRow(entity, jeId, serverResult);
        }

        // Remove the queue entry
        console.log(`[SyncManager] Removing ${rowId} from pending_entries`);
        this._storage.delRow('pending_entries', rowId);
        syncedCount++;
      } catch (err) {
        const retryCount = ((row.retryCount as number) || 0) + 1;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[SyncManager] Failed to sync ${rowId} (retry ${retryCount}/${MAX_RETRIES}):`, errorMsg);

        if (isAuthError(err)) {
          this._isAuthFailed = true;
        }

        if (retryCount >= MAX_RETRIES) {
          // Exhausted retries — Mark as failed instead of deleting
          console.error(`[SyncManager] MAX_RETRIES reached for ${rowId}. Marking as failed.`);
          this._storage.setRow('pending_entries', rowId, {
            ...row,
            status: 'failed',
            retryCount,
          });
          this._broadcast({
            type: 'push',
            event: 'sync-error',
            payload: { entryId: rowId, error: errorMsg, retriesLeft: 0 },
          } satisfies SyncErrorEvent);
        } else {
          // Schedule retry with exponential backoff
          const delay = calculateBackoff(retryCount);
          console.log(`[SyncManager] Scheduling retry for ${rowId} in ${delay}ms`);
          this._storage.setRow('pending_entries', rowId, {
            ...row,
            status: 'pending',
            retryCount,
            nextRetryAt: Date.now() + delay,
          });
          this._broadcast({
            type: 'push',
            event: 'sync-error',
            payload: { entryId: rowId, error: errorMsg, retriesLeft: MAX_RETRIES - retryCount },
          } satisfies SyncErrorEvent);
        }
      } finally {
        // ALWAYS emit progress after each row (success or failure) to update UI immediatey
        this._emitProgress();
      }
    }

    if (syncedCount > 0) {
      this._broadcast({
        type: 'push',
        event: 'sync-complete',
        payload: { syncedCount },
      } satisfies SyncCompleteEvent);
    }
  }

  private _emitProgress(): void {
    const allPending = this._storage.getAll('pending_entries');
    let pending = 0;
    let inFlight = 0;
    let failed = 0;

    for (const entry of allPending as unknown as PendingQueueEntry[]) {
      if (entry.status === 'in-flight') inFlight++;
      else if (entry.status === 'failed' || (entry.retryCount ?? 0) > 0) failed++;
      else pending++;
    }

    console.log(`[SyncManager] Emitting progress: pending=${pending}, inFlight=${inFlight}, failed=${failed}`);

    this._broadcast({
      type: 'push',
      event: 'sync-progress',
      payload: { pending, inFlight, completed: 0, failed },
    } satisfies SyncProgressEvent);
  }

  private getIdFieldName(entity: string): string {
    switch (entity) {
      case 'journalEntries': return 'journalEntryId';
      case 'prompts': return 'promptId';
      default: return 'id';
    }
  }
}
