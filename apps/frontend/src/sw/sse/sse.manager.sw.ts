import { journalEntriesDb } from '@frontend/modules/journal-entries/worker/journal-entries.db';
import { promptsDb } from '@frontend/modules/prompts/worker/prompts.db';
import { teamMembersDb } from '@frontend/worker/db/team_members.db';
import { teamsAppDb } from '@frontend/worker/db/teams_app.db';
import { clientDb, wipeTeamData } from '@frontend/worker/db/db.manager';
import { orpcFetch, UserAppBackendOutputs } from '@frontend/utils/orpc.client';
import { SSE_MESSAGES_CHANNEL, type SseMessage } from '@frontend/configs/channels.config';

type HeartbeatStream = UserAppBackendOutputs["sync"]["heartbeatSync"];

// Extract the individual event object from the stream's iterator
export type HeartbeatEvent = HeartbeatStream extends AsyncIterable<infer T> ? T : never;
export type SSEStatus = 'connected' | 'disconnected' | 'connecting' | 'sync-complete' | 'sync-error' | 'auth-error' | 'connection-error';

export class SSEManager {
    private static instance: SSEManager | null = null;

    public static getInstance(): SSEManager {
        if (!SSEManager.instance) {
            console.info('[SSEManager] Creating new instance...');
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

    constructor() {
        console.info('[SSEManager] constructor called');
    }

    private broadcastSSEMessage(type: SseMessage['type']) {
        const message: SseMessage = { type } as SseMessage;
        this.sseChannel.postMessage(message);
    }

    private async getLatestSyncMetadata(): Promise<Record<string, { updatedAt: number, cursor: string | null }>> {
        const tables = ['journalEntries', 'prompts', 'teamsApp', 'teamMembers'];
        const metadata: Record<string, { updatedAt: number, cursor: string | null }> = {};

        for (const table of tables) {
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
            console.info('[SSE] Heartbeat received');
            this.broadcastSSEMessage('SSE_HEARTBEAT');
            
            if (this.currentStatus === 'connected' && this.pendingTables.size === 0) {
                // We are idle and backend is synced
                this.updateStatus('sync-complete');
            }
            return;
        }

        console.info(`[SSE] Processing event: ${event.type}`);

        if (event.type === 'delta') {
            if ('error' in event && event.error) {
                console.error(`[SSE] Delta sync error for ${event.tableName}: ${event.error}`);
                this.erroredTables.add(event.tableName);
                this.pendingTables.delete(event.tableName);
                this.updateStatus('sync-error');
                this.abortController?.abort();
                return;
            }

            console.group(`[SSE] Received delta for ${event.tableName}`);
            console.debug(`Records: ${event.data.length}, isLastChunk: ${event.isLastChunk}`);
            
            try {
                if (event.data.length > 0) {
                    if (event.tableName === 'journalEntries') {
                        await journalEntriesDb.bulkUpsert(event.data as any[]);
                    } else if (event.tableName === 'prompts') {
                        await promptsDb.bulkUpsert(event.data as any[]);
                    } else if (event.tableName === "teamsApp") {
                        await teamsAppDb.saveTeams(event.data as any[]);
                        for (const team of (event.data as any[])) {
                            if (team.deletedAt) await wipeTeamData(team.teamAppId);
                        }
                    } else if (event.tableName === "teamMembers") {
                        await teamMembersDb.saveMembers(event.data as any[]);
                        for (const member of (event.data as any[])) {
                            if (member.userId === this.currentUserId && member.deletedAt) {
                                await wipeTeamData(member.teamAppId);
                            }
                        }
                    }
                }

                // Update metadata for this table
                const maxUpdatedAt = event.data.length > 0 
                  ? Math.max(...event.data.map((d: any) => d.updatedAt))
                  : 0;
                
                if (maxUpdatedAt > 0) {
                    await this.updateSyncMetadata(event.tableName, maxUpdatedAt, event.cursorId || undefined);
                }

                if (event.isLastChunk) {
                    console.info(`[SSE] Completed delta sync for table: ${event.tableName}`);
                    this.pendingTables.delete(event.tableName);
                    if (this.pendingTables.size === 0) {
                        if (this.erroredTables.size > 0) {
                            this.updateStatus('sync-error');
                        } else {
                            this.updateStatus('sync-complete');
                        }
                    }
                }
                console.groupEnd();
            } catch (err) {
                console.error(`[SSE] Failed to persist delta for ${event.tableName}:`, err);
                console.groupEnd();
                this.erroredTables.add(event.tableName);
                this.updateStatus('sync-error');
                this.abortController?.abort();
            }
            return;
        }

        // Handle real-time updates
        if (event.type === 'data-change-journalEntries') {
            console.info(`[SSE] Real-time [journalEntries]: ${event.operation}`);
            if (event.operation === 'delete') {
                await journalEntriesDb.bulkDelete(event.data.map((d: any) => d.journalEntryId));
            } else {
                await journalEntriesDb.bulkUpsert(event.data);
            }
        } else if (event.type === 'data-change-prompts') {
            if (event.operation === 'delete') {
                await promptsDb.bulkDelete(event.data);
            } else {
                await promptsDb.bulkUpsert(event.data);
            }
        } else if (event.type === "data-change-teamsApp") {
            if (event.operation === "delete") {
                for (const team of event.data) {
                    await wipeTeamData(team.teamAppId);
                }
                await clientDb.teamsApp.bulkDelete(event.data.map((t: any) => t.teamAppId));
            } else {
                await teamsAppDb.saveTeams(event.data);
            }
        } else if (event.type === "data-change-teamMembers") {
            if (event.operation === "delete") {
                const affectsMe = event.data.some((m: any) => m.userId === this.currentUserId);
                if (affectsMe) {
                    for (const member of event.data) {
                        if (member.userId === this.currentUserId) await wipeTeamData(member.teamAppId);
                    }
                }
                await clientDb.teamMembers.bulkDelete(event.data.map((m: any) => m.teamMemberId));
            } else {
                await teamMembersDb.saveMembers(event.data);
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
        if (this.abortController) this.abortController.abort();
        if (this.retryAbortController) this.retryAbortController.abort();
        this.updateStatus('disconnected');
    }

    public async reconnect() {
        console.info('[SSE] Manual reconnection triggered');
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
        console.info(`[SSEManager] startMonitoring called for userId: ${userId}`);

        while (this.isMonitoring) {
            console.info(`[SSE] Loop starting for user ${userId} at ${apiUrl}`);
            this.updateStatus('connecting');
            this.abortController = new AbortController();
            this.pendingTables = new Set(['journalEntries', 'prompts', 'teamsApp', 'teamMembers']);
            this.erroredTables.clear();

            try {
                console.info('[SSE] Fetching sync metadata...');
                const lastSyncMetadata = await this.getLatestSyncMetadata();
                console.info('[SSE] Last sync metadata:', lastSyncMetadata);

                // Mapping metadata for the backend
                const tableMarkers = Object.entries(lastSyncMetadata).map(([tableName, meta]) => ({
                    tableName: tableName as any,
                    cursorUpdatedAt: meta.updatedAt,
                    cursorId: meta.cursor
                }));

                console.info('[SSE] Initiating heartbeatSync stream...');
                const stream = await orpcFetch.sync.heartbeatSync({ 
                    type: 'heartbeat',
                    tableMarkers
                }, { signal: this.abortController.signal });

                console.info('[SSE] Stream obtained, waiting for events...');
                this.updateStatus('connected');
                this.broadcastSSEMessage('SSE_CONNECTED');
                this.resetHeartbeatWatchdog();
                this.retryCount = 0;

                for await (const event of stream) {
                    if (!this.isMonitoring) {
                        console.info('[SSE] Stop requested, breaking stream loop');
                        break;
                    }
                    console.info('[SSE] RAW EVENT:', event);
                    await this.handleSSEEvent(event);
                }
                console.info('[SSE] Stream loop exited naturally');
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') continue;
                
                if (err instanceof Error && err.name === 'FetchError' && (err as any).status === 401) {
                    this.isMonitoring = false;
                    this.updateStatus('auth-error');
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
self.addEventListener('message', (event: any) => {
    if (event.data?.type === 'REFRESH_SYNC') {
        SSEManager.getInstance().refresh();
    }
});