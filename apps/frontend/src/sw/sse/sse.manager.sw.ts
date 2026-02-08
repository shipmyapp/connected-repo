import { journalEntriesDb } from '@frontend/modules/journal-entries/worker/journal-entries.db';
import { promptsDb } from '@frontend/modules/prompts/worker/prompts.db';
import { UserAppBackendOutputs } from '@frontend/utils/orpc.client';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { SimpleCsrfProtectionLinkPlugin } from '@orpc/client/plugins';
import type { UserAppRouter } from "../../../../backend/src/routers/user_app/user_app.router";

type HeartbeatStream = UserAppBackendOutputs["sync"]["heartbeatSync"];

// Extract the individual event object from the stream's iterator
export type HeartbeatEvent = HeartbeatStream extends AsyncIterable<infer T> ? T : never;
export type SSEStatus = 'connected' | 'disconnected' | 'connecting' | 'sync-complete' | 'sync-error' | 'auth-error' | 'connection-error';

export class SSEManager {
    private currentStatus: SSEStatus = 'disconnected';
    private statusListeners = new Set<(status: SSEStatus) => void>();
    private abortController: AbortController | null = null;
    private heartbeatTimer: number | null = null;
    private HEARTBEAT_TIMEOUT = 15000; // 15s
    private isMonitoring = false;
    private retryAbortController: AbortController | null = null;
    private retryCount = 0;

    // Track initial sync state for tables
    private pendingTables = new Set<string>();
    private erroredTables = new Set<string>();

    private async getLatestTimestamps(): Promise<Record<string, number>> {
        try {
            const journalEntry = await journalEntriesDb.getLatestUpdatedAt();
            const prompt = await promptsDb.getLatestUpdatedAt();

            return {
                journalEntries: journalEntry?.updatedAt ?? 0,
                prompts: prompt?.updatedAt ?? 0,
            };
        } catch (err) {
            console.error('[SSE] Failed to fetch latest timestamps:', err);
            return {
                journalEntries: 0,
                prompts: 0,
            };
        }
    }

    private updateStatus(status: SSEStatus) {
        if (this.currentStatus !== status) {
            console.info(`[SSE] Status changed: ${this.currentStatus} -> ${status}`);
        }
        this.currentStatus = status;
        this.statusListeners.forEach(cb => {
            try { 
                cb(status); 
            } catch (err) { 
                console.error(`[SSE] Failed to notify a listener:`, err);
                this.statusListeners.delete(cb); 
            }
        });
    }

    private resetHeartbeatWatchdog() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
        }
        this.heartbeatTimer = setTimeout(() => {
            console.warn('[SSE] Heartbeat timeout. Restarting...');
            this.abortController?.abort();
        }, this.HEARTBEAT_TIMEOUT) as unknown as number;
    }

    private async handleSSEEvent(event: HeartbeatEvent) {
        // Reset watchdog on ANY event (data or heartbeat)
        this.resetHeartbeatWatchdog();

        if (event.type === 'heartbeat') {
            console.debug('[SSE] Heartbeat received');
            return;
        }

        if (event.type === 'delta') {
            if (event.error) {
                console.error(`[SSE] Delta sync error for ${event.table}: ${event.error}`);
                this.erroredTables.add(event.table);
                this.pendingTables.delete(event.table);
                this.updateStatus('sync-error');
                // Abort connection to force a clean retry and maintain consistency
                this.abortController?.abort();
                return;
            }

            console.info(`[SSE] Received delta for ${event.table} (${event.data.length} records). isLastChunk: ${event.isLastChunk}`);
            
            try {
                if (event.data.length > 0) {
                    if (event.table === 'journalEntries') {
                        await journalEntriesDb.bulkUpsert(event.data);
                    } else if (event.table === 'prompts') {
                        await promptsDb.bulkUpsert(event.data);
                    }
                }

                if (event.isLastChunk) {
                    this.pendingTables.delete(event.table);
                    if (this.pendingTables.size === 0 && this.currentStatus === 'connected') {
                        if (this.erroredTables.size > 0) {
                            console.warn('[SSE] Initial delta synchronization complete with errors');
                            this.updateStatus('sync-error');
                        } else {
                            console.info('[SSE] Initial delta synchronization complete for all tables');
                            this.updateStatus('sync-complete');
                        }
                    }
                }
            } catch (err) {
                console.error(`[SSE] Failed to persist delta for ${event.table}:`, err);
                this.erroredTables.add(event.table);
                this.updateStatus('sync-error');
                // Abort connection to force a clean retry and maintain consistency
                this.abortController?.abort();
            }
            return;
        }

        // Handle real-time updates
        if (event.type === 'data-change-journalEntries') {
            console.info(`[SSE] Received real-time update for journalEntries (${event.data.length} records). Operation: ${event.operation}`);
            if (event.operation === 'delete') {
                await journalEntriesDb.bulkDelete(event.data.map((d: { journalEntryId: string }) => d.journalEntryId));
            } else {
                await journalEntriesDb.bulkUpsert(event.data);
            }
        } else if (event.type === 'data-change-prompts') {
            console.info(`[SSE] Received real-time update for prompts (${event.data.length} records). Operation: ${event.operation}`);
            if (event.operation === 'delete') {
                await promptsDb.bulkDelete(event.data);
            } else {
                await promptsDb.bulkUpsert(event.data);
            }
        }
    }

    public async getStatus(): Promise<SSEStatus> { 
        return this.currentStatus; 
    }

    public async onStatusChange(callback: (status: SSEStatus) => void) {
        this.statusListeners.add(callback);
    }

    public async stopMonitoring() {
        this.isMonitoring = false;
        if (this.abortController) {
            this.abortController.abort();
        }
        if (this.retryAbortController) {
            this.retryAbortController.abort();
        }
        this.updateStatus('disconnected');
    }

    public async reconnect() {
        console.info('[SSE] Manual reconnection triggered');
        this.retryCount = 0;
        if (this.retryAbortController) {
            this.retryAbortController.abort();
        }
    }

    public async startMonitoring(apiUrl: string) {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.retryCount = 0;
        
        const link = new RPCLink({
            url: `${apiUrl}/user-app`,
            fetch: (req, init) => globalThis.fetch(req, { ...init, credentials: 'include' }),
            plugins: [new SimpleCsrfProtectionLinkPlugin()],
        });
        const orpc = createORPCClient<UserAppRouter>(link);

        while (this.isMonitoring) {
            this.updateStatus('connecting');
            this.abortController = new AbortController();
            
            // Re-initialize pending tables for delta-on-connect
            this.pendingTables = new Set(['journalEntries', 'prompts']);
            this.erroredTables.clear();

            try {
                const lastSyncTimestamps = await this.getLatestTimestamps();

                const stream = await orpc.sync.heartbeatSync({ lastSyncTimestamps }, { signal: this.abortController.signal });
                this.updateStatus('connected');
                this.resetHeartbeatWatchdog();
                this.retryCount = 0;

                for await (const event of stream) {
                    if (!this.isMonitoring) break;
                    await this.handleSSEEvent(event);
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') {
                    continue;
                }
                
                // Handle 401 Unauthorized - Stop monitoring if session is invalid
                if (err instanceof Error && err.name === 'FetchError' && (err as any).status === 401) {
                    console.error('[SSE] Unauthorized. Stopping monitoring.');
                    this.isMonitoring = false;
                    this.updateStatus('auth-error');
                    break;
                }

                console.error('[SSE] Connection lost or failed to establish:', err);
                if (err instanceof Error) {
                    console.error(`[SSE] Error details: ${err.name} - ${err.message}\n${err.stack}`);
                }
                this.updateStatus('connection-error');
            } finally {
                this.updateStatus('disconnected');
                if (this.heartbeatTimer) {
                    clearTimeout(this.heartbeatTimer);
                }

                if(this.isMonitoring) {
                    const backoff = Math.min(30000, Math.pow(2, this.retryCount) * 1000);
                    const jitter = backoff * 0.2 * Math.random();
                    const delay = backoff + jitter;

                    console.log(`[SSE] Retrying in ${Math.round(delay)}ms (Attempt ${this.retryCount + 1})...`);
                    
                    this.retryAbortController = new AbortController();
                    try {
                        await new Promise((resolve, reject) => {
                            const timer = setTimeout(resolve, delay);
                            this.retryAbortController?.signal.addEventListener('abort', () => {
                                clearTimeout(timer);
                                reject(new Error('RetryAborted'));
                            });
                        });
                    } catch (e) {
                        if (!(e instanceof Error && e.message === 'RetryAborted')) {
                            throw e;
                        }
                    } finally {
                        this.retryAbortController = null;
                        this.retryCount++;
                    }
                }
            }
        }
    }
}