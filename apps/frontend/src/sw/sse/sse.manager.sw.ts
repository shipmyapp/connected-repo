import { clientDb, wipeTeamData } from '@frontend/worker/db/db.manager';
import { orpcFetch, UserAppBackendOutputs } from '@frontend/utils/orpc.client';
import { SSE_MESSAGES_CHANNEL, type SseMessage } from '@frontend/configs/channels.config';
import { TABLES_TO_SYNC_ENUM, TablesToSync } from '@connected-repo/zod-schemas/enums.zod';
import { journalEntriesDb } from '@frontend/modules/journal-entries/worker/journal-entries.db';
import { promptsDb } from '@frontend/modules/prompts/worker/prompts.db';
import { teamsAppDb } from '@frontend/worker/db/teams_app.db';
import { teamMembersDb } from '@frontend/worker/db/team_members.db';
import { filesDb } from '@frontend/worker/db/files.db';

type HeartbeatStream = UserAppBackendOutputs["sync"]["heartbeatSync"];

// Extract the individual event object from the stream's iterator
export type HeartbeatEvent = HeartbeatStream extends AsyncIterable<infer T> ? T : never;
export type DeltaOutput = Extract<HeartbeatEvent, { type: 'delta' }>;
export type SSEStatus = 'connected' | 'disconnected' | 'connecting' | 'sync-complete' | 'sync-error' | 'auth-error' | 'connection-error';

type TableDataMap = {
    [K in TablesToSync]: Extract<DeltaOutput, { tableName: K }>['data']
};

export class SSEManager {
    private static instance: SSEManager | null = null;

    public static getInstance(): SSEManager {
        if (!SSEManager.instance) {
            SSEManager.instance = new SSEManager();
        }
        return SSEManager.instance;
    }
    private currentStatus: SSEStatus = 'disconnected';
    private currentUserId: string | null = null;
    private statusListeners = new Set<(status: SSEStatus) => void>();
    private abortController: AbortController | null = null;
    private heartbeatTimer: number | null = null;
    private HEARTBEAT_TIMEOUT = 30000; // 30s
    private isMonitoring = false;
    private retryAbortController: AbortController | null = null;
    private retryCount = 0;
    private sseChannel = new BroadcastChannel(SSE_MESSAGES_CHANNEL);

    // Track initial sync state for tables
    private pendingTables = new Set<string>();
    private erroredTables = new Set<string>();

    private tableHandlers: {
        [K in TablesToSync]: (data: TableDataMap[K], operation?: 'create' | 'update' | 'delete' | 'delta') => Promise<void>
    } = {
        journalEntries: async (data, op) => {
            const ids = data.map(d => typeof d === 'string' ? d : d.id);
            if (op === 'delete') await journalEntriesDb.bulkDelete(ids);
            else {
                const objects = data.filter((d): d is Exclude<typeof d, string> => typeof d !== 'string');
                await journalEntriesDb.bulkUpsert(objects);
            }
        },
        prompts: async (data, op) => {
            const objects = data.filter((d): d is Exclude<typeof d, string> => typeof d !== 'string');
            if (op === 'delete') {
                if (objects.length > 0) await promptsDb.bulkDelete(objects);
            } else {
                await promptsDb.bulkUpsert(objects);
            }
        },
        teamsApp: async (data, op) => {
            const ids = data.map(t => typeof t === 'string' ? t : t.id);
            if (op === 'delete') {
                for (const id of ids) await wipeTeamData(id);
                await clientDb.teamsApp.bulkDelete(ids);
            } else {
                const objects = data.filter((t): t is Exclude<typeof t, string> => typeof t !== 'string');
                await teamsAppDb.saveTeams(objects);
                for (const team of objects) {
                    if (team.deletedAt) await wipeTeamData(team.id);
                }
            }
        },
        teamMembers: async (data, op) => {
            if (op === 'delete') {
                const affectedTeamIds = data.map(m => typeof m === 'string' ? m : m.teamId);
                const affectsMe = data.some(m => (typeof m === 'string' ? m : m.userId) === this.currentUserId);
                if (affectsMe) {
                    for (const teamId of affectedTeamIds) await wipeTeamData(teamId);
                }
                await clientDb.teamMembers.bulkDelete(affectedTeamIds);
            } else {
                const objects = data.filter((m): m is Exclude<typeof m, string> => typeof m !== 'string');
                await teamMembersDb.saveMembers(objects);
                for (const member of objects) {
                    if (member.userId === this.currentUserId && member.deletedAt) {
                        await wipeTeamData(member.teamId);
                    }
                }
            }
        },
        files: async (data, op) => {
            const ids = data.map(d => typeof d === 'string' ? d : d.id);
            if (op === 'delete') await filesDb.bulkDelete(ids);
            else {
                const objects = data.filter((d): d is Exclude<typeof d, string> => typeof d !== 'string');
                await filesDb.bulkUpsert(objects);
            }
        }
    };

    private async runHandler<T extends TablesToSync>(tableName: T, data: TableDataMap[T], operation?: "create" | "update" | "delete" | "delta") {
      const handler = this.tableHandlers[tableName];
      if (handler) {
          // Safe cast within the generic helper to bridge the correlated union mapping
          await handler(data, operation);
      }
    }

    constructor() {
        
    }

    private broadcastSSEMessage(type: SseMessage['type']) {
        const message: SseMessage = { type } as SseMessage;
        this.sseChannel.postMessage(message);
    }

    private async getLatestSyncMetadata(): Promise<Record<TablesToSync, { updatedAt: number, cursor: string | null }>> {
        const metadata: Record<string, { updatedAt: number, cursor: string | null }> = {};

        for (const table of TABLES_TO_SYNC_ENUM) {
            const row = await clientDb.syncMetadata.get(table);
            metadata[table] = {
                updatedAt: row?.cursorUpdatedAt ?? 0,
                cursor: row?.cursorId ?? null
            };
        }
        return metadata;
    }

    private async updateSyncMetadata(table: string, updatedAt: number, cursorId?: string | null) {
        await clientDb.syncMetadata.put({
            tableName: table,
            cursorUpdatedAt: updatedAt,
            cursorId: cursorId ?? null
        });
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
            this.broadcastSSEMessage('SSE_HEARTBEAT');
            if (this.currentStatus === 'connected' && this.pendingTables.size === 0) {
                // We are idle and backend is synced
                this.updateStatus('sync-complete');
            }
            return;
        }

        if (event.type === 'delta') {
            if ('error' in event && event.error) {
                console.error(`[SSE] Delta error [${event.tableName}]: ${event.error}`);
                this.erroredTables.add(event.tableName);
                this.pendingTables.delete(event.tableName);
                this.updateStatus('sync-error');
                this.abortController?.abort();
                return;
            }

            try {
                if (event.data.length > 0) {
                    await this.runHandler(event.tableName, event.data, event.type);
                }

                const maxUpdatedAt = event.data.length > 0 
                  ? Math.max(...event.data.map((d) => d.updatedAt))
                  : 0;
                
                if (maxUpdatedAt > 0) {
                    await this.updateSyncMetadata(event.tableName, maxUpdatedAt, event.cursorId || undefined);
                }

                if (event.isLastChunk) {
                    this.pendingTables.delete(event.tableName);
                    if (this.pendingTables.size === 0) {
                        this.updateStatus(this.erroredTables.size > 0 ? 'sync-error' : 'sync-complete');
                    }
                }
            } catch (err) {
                console.error(`[SSE] Delta persist fail [${event.tableName}]:`, err);
                this.erroredTables.add(event.tableName);
                this.updateStatus('sync-error');
                this.abortController?.abort();
            }
            return;
        }

        // Real-time updates
        const tableMatch = event.type.match(/^data-change-(.+)$/);
        if (tableMatch) {
            const tableName = tableMatch[1] as TablesToSync;
            await this.runHandler(tableName, event.data as any, event.operation);
        }
    }

    private async waitForOnline() {
        if (navigator.onLine) return;
        
        this.updateStatus('disconnected');
        
        return new Promise<void>((resolve) => {
            const handleOnline = () => {
                self.removeEventListener('online', handleOnline);
                resolve();
            };
            self.addEventListener('online', handleOnline);
        });
    }

    public async getStatus(): Promise<SSEStatus> { 
        return this.currentStatus; 
    }

    public async onStatusChange(callback: (status: SSEStatus) => void) {
        this.statusListeners.add(callback);
    }

    public async stopMonitoring() {
        this.isMonitoring = false;
        if (this.abortController) this.abortController.abort();
        if (this.retryAbortController) this.retryAbortController.abort();
        this.updateStatus('disconnected');
    }

    public async reconnect() {
        this.retryCount = 0;
        if (this.retryAbortController) this.retryAbortController.abort();
    }

    public async refresh() {
        if (this.currentStatus === 'connecting') return;
        this.abortController?.abort();
    }

    public async startMonitoring(apiUrl: string, userId: string) {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.currentUserId = userId;
        this.retryCount = 0;

        while (this.isMonitoring) {
            await this.waitForOnline();
            if (!this.isMonitoring) break;

            this.updateStatus('connecting');
            this.abortController = new AbortController();
            this.pendingTables = new Set(TABLES_TO_SYNC_ENUM);
            this.erroredTables.clear();

            try {
                const lastSyncMetadata = await this.getLatestSyncMetadata();
                const tableMarkers = Object.entries(lastSyncMetadata).map(([tableName, meta]) => ({
                    tableName: tableName as TablesToSync,
                    cursorUpdatedAt: meta.updatedAt,
                    cursorId: meta.cursor
                }));

                const stream = await orpcFetch.sync.heartbeatSync({ 
                    type: 'heartbeat',
                    tableMarkers
                }, { signal: this.abortController.signal });

                this.updateStatus('connected');
                this.broadcastSSEMessage('SSE_CONNECTED');
                this.resetHeartbeatWatchdog();
                this.retryCount = 0;

                for await (const event of stream) {
                    if (!this.isMonitoring) break;
                    await this.handleSSEEvent(event);
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') continue;
                
                if (err instanceof Error && err.name === 'FetchError' && 'status' in err && err.status === 401) {
                    console.error('[SSE] Auth failure (401)');
                    this.isMonitoring = false;
                    this.updateStatus('auth-error');
                    this.broadcastSSEMessage('SSE_AUTH_ERROR');
                    break;
                }

                console.error('[SSE] Connection failed:', err);
                this.updateStatus('connection-error');
            } finally {
                this.updateStatus('disconnected');
                if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);

                if(this.isMonitoring) {
                    const backoff = Math.min(30000, Math.pow(2, this.retryCount) * 1000);
                    const jitter = backoff * 0.2 * Math.random();
                    const delay = backoff + jitter;
                    
                    this.retryAbortController = new AbortController();
                    try {
                        await new Promise<void>((resolve, reject) => {
                            const timer = setTimeout(resolve, delay);
                            this.retryAbortController?.signal.addEventListener('abort', () => {
                                clearTimeout(timer);
                                reject(new Error('RetryAborted'));
                            });
                        });
                    } catch (e) {
                        if (!(e instanceof Error && e.message === 'RetryAborted')) throw e;
                    } finally {
                        this.retryAbortController = null;
                        this.retryCount++;
                    }
                }
            }
        }
    }
}

// Service Worker event listeners
self.addEventListener('message', ((event: ExtendableMessageEvent) => {
    if (event.data?.type === 'REFRESH_SYNC') {
        SSEManager.getInstance().refresh();
    }
}) as EventListener);