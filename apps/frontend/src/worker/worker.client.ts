import { ulid } from 'ulid';
import type {
  EntityName,
  WorkerOutgoing,
  WorkerPushEvent,
  WorkerResponse,
  WorkerRequest,
  WorkerRequestPayload,
} from './worker.types';

const TIMEOUT_MS = 30_000;

type PushEventListener = (event: WorkerPushEvent) => void;

interface PendingRequest {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class DataWorkerClient {
  private _worker: Worker | null = null;
  private _pending = new Map<string, PendingRequest>();
  private _pushListeners = new Set<PushEventListener>();
  private _initialized = false;
  private _initPromise: Promise<void> | null = null;
  private _queue: WorkerRequest[] = [];

  /**
   * Spawn the Web Worker and send the `init` message.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  initialize(apiUrl: string): Promise<void> {
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise<void>((resolve, reject) => {
      try {
        this._worker = new Worker(
          new URL('./data.worker.ts', import.meta.url),
          { type: 'module' },
        );

        this._worker.onmessage = (event: MessageEvent<WorkerOutgoing>) => {
          this._handleMessage(event.data);
        };

        this._worker.onerror = (err) => {
          console.error('[DataWorkerClient] Worker error:', err);
        };

        // Send init
        const correlationId = ulid();
        this._sendRaw({
          correlationId,
          type: 'init',
          payload: { apiUrl },
        });

        // Wait for init response
        this._registerPending(correlationId, (response) => {
          if (response.success) {
            console.log('[DataWorkerClient] Worker initialized. Flushing queue...', this._queue.length);
            this._initialized = true;
            
            // Flush queue
            const queue = [...this._queue];
            this._queue = [];
            for (const msg of queue) {
              this._sendRaw(msg);
            }
            
            resolve();
          } else {
            this._initPromise = null; // Allow retry
            reject(new Error((response as { error: { message: string } }).error.message));
          }
        });
      } catch (err) {
        this._initPromise = null; // Allow retry
        reject(err);
      }
    });

    return this._initPromise;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Send a read query to the Worker.
   */
  async query<T = unknown>(params: {
    entity: EntityName;
    operation: string;
    payload?: Record<string, unknown>;
    sortBy?: string;
    descending?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ data: T; meta: { source: 'server' | 'cache'; total?: number } }> {
    return this._rpc<T>({
      type: 'query',
      entity: params.entity,
      operation: params.operation,
      payload: params.payload,
      sortBy: params.sortBy,
      descending: params.descending,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * Send a mutation to the Worker.
   */
  async mutate<T = unknown>(params: {
    entity: EntityName;
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<{ data: T; meta: { source: 'server' | 'cache' } }> {
    return this._rpc<T>({
      type: 'mutation',
      entity: params.entity,
      operation: params.operation,
      payload: params.payload,
    });
  }

  /**
   * Fetch pending entries for a given entity from the Worker.
   */
  async getPending<T = unknown>(params: {
    entity: EntityName;
    sortBy?: string;
    descending?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ data: T[]; meta: { source: 'server' | 'cache'; total?: number } }> {
    return this._rpc<T[]>({
      type: 'get-pending',
      entity: params.entity,
      sortBy: params.sortBy,
      descending: params.descending,
      limit: params.limit,
      offset: params.offset,
    });
  }

  /**
   * Fetch a specific pending entry by its internal ID.
   */
  async getPendingById<T = unknown>(params: {
    entity: EntityName;
    id: string;
  }): Promise<{ data: T | null; meta: { source: 'server' | 'cache' } }> {
    return this._rpc<T | null>({
      type: 'get-pending-by-id',
      entity: params.entity,
      id: params.id,
    });
  }

  /**
   * Request the Worker to drain its pending queue immediately.
   */
  async forceSync(): Promise<void> {
    console.log(`[DataWorkerClient] forceSync() requested`);
    await this._rpc<void>({
      type: 'force-sync',
      payload: { force: true },
    });
  }

  /**
   * Get the current count of pending entries in the worker.
   */
  async getPendingCount(): Promise<number> {
    const response = await this._rpc<{ count: number }>({
      type: 'get-pending-count',
    });
    return response.data.count;
  }

  /**
   * Get current sync status (online, sseStatus) from the worker.
   */
  async getSyncStatus(): Promise<{ isOnline: boolean; sseStatus: 'connected' | 'disconnected' | 'connecting' }> {
    const response = await this._rpc<{ isOnline: boolean; sseStatus: 'connected' | 'disconnected' | 'connecting' }>({
      type: 'get-sync-status',
    });
    return response.data;
  }

  /**
   * Get sync metadata (e.g. current user email/id) from the worker.
   */
  async getSyncMeta(): Promise<Record<string, string>> {
     const response = await this._rpc<Record<string, string>>({
       type: 'get-sync-meta',
     });
     return response.data;
  }

  /**
   * Update user metadata (owner) in the worker's TinyBase.
   */
  async updateUserMeta(userId: string, userEmail: string): Promise<void> {
    await this._rpc<void>({
      type: 'update-user-meta',
      payload: { userId, userEmail },
    });
  }

  /**
   * Clear all local caches in the worker.
   */
  async clearCache(): Promise<void> {
    console.log(`[DataWorkerClient] clearCache() requested`);
    await this._rpc<void>({
      type: 'clear-cache',
    });
  }

  /** Forward a sync update from Service Worker to the data worker */
  forwardFromSw(payload: any): void {
    const msg: any = {
      type: 'sync-update',
      payload,
      correlationId: `bg-sync-${crypto.randomUUID()}`,
    };
    if (!this._initialized) {
      console.log('[DataWorkerClient] Worker not initialized, queuing sync-update');
      this._queue.push(msg);
    } else {
      this._worker?.postMessage(msg);
    }
  }

  /** Forward an arbitrary event from Service Worker to the data worker to be broadcast to all clients */
  forwardEventFromSw(event: string, payload: any): void {
    const msg: any = {
      type: 'relay-event',
      payload: { event, payload },
      correlationId: `bg-event-${crypto.randomUUID()}`,
    };
    if (!this._initialized) {
      console.log(`[DataWorkerClient] Worker not initialized, queuing relay-event: ${event}`);
      this._queue.push(msg);
    } else {
      this._worker?.postMessage(msg);
    }
  }
  onPushEvent(listener: PushEventListener): () => void {
    this._pushListeners.add(listener);
    return () => {
      this._pushListeners.delete(listener);
    };
  }

  // ── Private ─────────────────────────────────────────────────────

  private async _rpc<T>(
    message: WorkerRequestPayload,
  ): Promise<{ data: T; meta: { source: 'server' | 'cache'; total?: number } }> {
    if (!this._worker) {
      console.error('[DataWorkerClient] Cannot execute RPC - Worker not created');
      throw new Error('Worker not created');
    }

    if (!this._initialized) {
      if (this._initPromise) {
        console.log(`[DataWorkerClient] RPC ${message.type} delayed - waiting for initialization...`);
        await this._initPromise;
      } else {
        console.error('[DataWorkerClient] Cannot execute RPC - Worker not initialized');
        throw new Error('Worker not initialized');
      }
    }

    const correlationId = crypto.randomUUID();
    console.log(`[DataWorkerClient] Executing RPC: ${message.type || 'unknown'} (CID: ${correlationId})`, message);

    return new Promise<{ data: T; meta: { source: 'server' | 'cache'; total?: number } }>((resolve, reject) => {
      this._registerPending(correlationId, (response) => {
        console.log(`[DataWorkerClient] RPC Callback (CID: ${correlationId}):`, response);
        if (response.success) {
          resolve({
            data: response.data as T,
            meta: response.meta,
          });
        } else {
          reject(new Error(response.error.message));
        }
      });

      this._sendRaw({ ...message, correlationId } as WorkerRequest);
    });
  }

  private _registerPending(
    correlationId: string,
    onResponse: (response: WorkerResponse) => void,
  ): void {
    const timer = setTimeout(() => {
      const entry = this._pending.get(correlationId);
      if (entry) {
        this._pending.delete(correlationId);
        entry.reject(new Error(`Worker request timed out (${TIMEOUT_MS}ms)`));
      }
    }, TIMEOUT_MS);

    this._pending.set(correlationId, {
      resolve: onResponse as (value: WorkerResponse) => void,
      reject: (err: Error) => onResponse({
        correlationId,
        type: 'response',
        success: false,
        error: { message: err.message },
      }),
      timer,
    });
  }

  private _handleMessage(msg: WorkerOutgoing): void {
    console.log(`[DataWorkerClient] Received message: ${msg.type}`, msg);
    if (msg.type === 'response') {
      const entry = this._pending.get(msg.correlationId);
      if (entry) {
        clearTimeout(entry.timer);
        this._pending.delete(msg.correlationId);
        entry.resolve(msg);
      } else {
        console.warn(`[DataWorkerClient] Received response for unknown/timed-out CID: ${msg.correlationId}`);
      }
      return;
    }

    if (msg.type === 'push') {
      console.log(`[DataWorkerClient] Broadcasting push event: ${msg.event}`);
      for (const listener of this._pushListeners) {
        try {
          listener(msg);
        } catch (err) {
          console.error('[DataWorkerClient] Push listener error:', err);
        }
      }
    }
  }

  private _sendRaw(msg: WorkerRequest): void {
    if (msg.type !== 'init' && !this._initialized) {
      console.log(`[DataWorkerClient] Worker not initialized, queuing message: ${msg.type} (CID: ${msg.correlationId})`);
      this._queue.push(msg);
      return;
    }

    console.log(`[DataWorkerClient] Sending raw message: ${msg.type || 'unknown'} (CID: ${msg.correlationId})`, msg);
    this._worker?.postMessage(msg);
  }
}

/** Singleton — shared across the entire main-thread application. */
export const dataWorkerClient = new DataWorkerClient();
