import { journalEntriesDb } from '@frontend/modules/journal-entries/worker/journal-entries.db';
import { promptsDb } from '@frontend/modules/prompts/worker/prompts.db';
import { pendingSyncJournalEntriesDb } from '@frontend/worker/db/pending-sync-journal-entries.db';
import { db, wipeTeamData } from '@frontend/worker/db/db.manager';
import { orpcFetch, UserAppBackendOutputs } from '@frontend/utils/orpc.client';

type HeartbeatStream = UserAppBackendOutputs["sync"]["heartbeatSync"];

// Extract the individual event object from the stream's iterator
export type HeartbeatEvent = HeartbeatStream extends AsyncIterable<infer T> ? T : never;
export type SSEStatus = 'connected' | 'disconnected' | 'connecting' | 'sync-complete' | 'sync-error' | 'auth-error' | 'connection-error';

export class SSEManager {
    private currentStatus: SSEStatus = 'disconnected';
    private currentUserId: string | null = null;
    private statusListeners = new Set<(status: SSEStatus) => void>();
    private abortController: AbortController | null = null;
    private heartbeatTimer: number | null = null;
    private HEARTBEAT_TIMEOUT = 30000; // 30s
    private isMonitoring = false;
    private retryAbortController: AbortController | null = null;
    private retryCount = 0;

    // Track initial sync state for tables
    private pendingTables = new Set<string>();
    private erroredTables = new Set<string>();

    constructor() {
        // Subscribe to database changes (via BroadcastChannel) to handle "syncing" status for local pending entries
        // This is necessary because DB writes happen in the Web Worker, while this manager lives in the Service Worker.
        const dbUpdatesChannel = new BroadcastChannel("db-updates");
        dbUpdatesChannel.onmessage = async (event) => {
            const { table } = event.data;
            if (table === 'pendingSyncJournalEntries') {
                const count = await pendingSyncJournalEntriesDb.count();
                if (count > 0 && this.currentStatus === 'sync-complete') {
                    console.info(`[SSE] New pending entries detected (${count}). Reverting to 'connected'.`);
                    this.updateStatus('connected');
                } else if (count === 0 && this.currentStatus === 'connected' && this.pendingTables.size === 0) {
                    console.info(`[SSE] Local queue cleared. Advancing to 'sync-complete'.`);
                    this.updateStatus('sync-complete');
                }
            }
        };
    }

    private async getLatestTimestamps(): Promise<Record<string, number>> {
        try {
            const journalEntry = await journalEntriesDb.getLatestUpdatedAt();
            const prompt = await promptsDb.getLatestUpdatedAt();
            const teamApp = await db.teamsApp.orderBy("updatedAt").last();
            const teamMember = await db.teamMembers.orderBy("updatedAt").last();

            return {
                journalEntries: journalEntry?.updatedAt ?? 0,
                prompts: prompt?.updatedAt ?? 0,
                teamsApp: teamApp?.updatedAt ?? 0,
                teamMembers: teamMember?.updatedAt ?? 0,
            };
        } catch (err) {
            console.error('[SSE] Failed to fetch latest timestamps:', err);
            return {
                journalEntries: 0,
                prompts: 0,
                teamsApp: 0,
                teamMembers: 0,
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
            // If we are 'connected' but not yet 'sync-complete', re-check if we can transition
            if (this.currentStatus === 'connected' && this.pendingTables.size === 0) {
              const pendingCount = await pendingSyncJournalEntriesDb.count();
              if (pendingCount === 0 && this.erroredTables.size === 0) {
                console.info('[SSE] All backend data synced and no more local pending entries. Setting sync-complete.');
                this.updateStatus('sync-complete');
              }
            }
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

            console.group(`[SSE] Received delta for ${event.table}`);
            console.debug(`Records: ${event.data.length}, isLastChunk: ${event.isLastChunk}`);
            
            try {
                if (event.data.length > 0) {
                    if (event.table === 'journalEntries') {
                        await journalEntriesDb.bulkUpsert(event.data);
                    } else if (event.table === 'prompts') {
                        await promptsDb.bulkUpsert(event.data);
                    } else if (event.table === "teamsApp") {
                        await db.teamsApp.bulkPut(event.data);
                        // If any team is deleted in delta, wipe its data
                        for (const team of event.data) {
                            if (team.deletedAt) {
                                await wipeTeamData(team.teamAppId);
                            }
                        }
                    } else if (event.table === "teamMembers") {
                        await db.teamMembers.bulkPut(event.data);
                        // If my membership is deleted in delta, wipe that team's data
                        for (const member of event.data) {
                            if (member.userId === this.currentUserId && member.deletedAt) {
                                await wipeTeamData(member.teamAppId);
                            }
                        }
                    }
                }
                if (event.isLastChunk) {
                    console.info(`[SSE] Completed delta sync for table: ${event.table}`);
                    this.pendingTables.delete(event.table);
                    if (this.pendingTables.size === 0) {
                        const pendingCount = await pendingSyncJournalEntriesDb.count();
                        if (this.erroredTables.size > 0) {
                            console.warn('[SSE] Initial delta synchronization complete with errors');
                            this.updateStatus('sync-error');
                        } else if (pendingCount > 0) {
                            console.info(`[SSE] Backend synced, but ${pendingCount} local entries are still pending. Staying in 'connected' state.`);
                            this.updateStatus('connected');
                        } else {
                            console.info('[SSE] All tables synchronized successfully and no local pending data.');
                            this.updateStatus('sync-complete');
                        }
                    }
                }
                console.groupEnd();
            } catch (err) {
                console.error(`[SSE] Failed to persist delta for ${event.table}:`, err);
                console.groupEnd();
                this.erroredTables.add(event.table);
                this.updateStatus('sync-error');
                // Abort connection to force a clean retry and maintain consistency
                this.abortController?.abort();
            }
            return;
        }

        // Handle real-time updates
        if (event.type === 'data-change-journalEntries') {
            console.info(`[SSE] Real-time update [journalEntries]: ${event.operation} (${event.data.length} records)`);
            if (event.operation === 'delete') {
                await journalEntriesDb.bulkDelete(event.data.map((d: { journalEntryId: string }) => d.journalEntryId));
            } else {
                await journalEntriesDb.bulkUpsert(event.data);
            }
        } else if (event.type === 'data-change-prompts') {
            console.info(`[SSE] Real-time update [prompts]: ${event.operation} (${event.data.length} records)`);
            if (event.operation === 'delete') {
                await promptsDb.bulkDelete(event.data);
            } else {
                await promptsDb.bulkUpsert(event.data);
            }
        } else if (event.type === "data-change-teamsApp") {
            console.info(`[SSE] Real-time update [teamsApp]: ${event.operation} (${event.data.length} records)`);
            if (event.operation === "delete") {
                for (const team of event.data) {
                    await wipeTeamData(team.teamAppId);
                }
                await db.teamsApp.bulkDelete(event.data.map((t: any) => t.teamAppId));
            } else {
                await db.teamsApp.bulkPut(event.data);
            }
        } else if (event.type === "data-change-teamMembers") {
            console.info(`[SSE] Real-time update [teamMembers]: ${event.operation} (${event.data.length} records)`);
            if (event.operation === "delete") {
                const affectsMe = event.data.some((m: any) => m.userId === this.currentUserId);
                if (affectsMe) {
                    for (const member of event.data) {
                        if (member.userId === this.currentUserId) {
                            await wipeTeamData(member.teamAppId);
                        }
                    }
                }
                await db.teamMembers.bulkDelete(event.data.map((m: any) => m.teamMemberId));
            } else {
                await db.teamMembers.bulkPut(event.data);
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

    public async refresh() {
        if (this.currentStatus === 'connecting') {
            console.warn('[SSE] Already connecting, refresh ignored');
            return;
        }
        console.info('[SSE] Manual refresh triggered - aborting current connection to fetch deltas');
        this.abortController?.abort();
    }

    public async startMonitoring(apiUrl: string, userId: string) {
        if (this.isMonitoring) return;
        this.isMonitoring = true;
        this.currentUserId = userId;
        this.retryCount = 0;

        while (this.isMonitoring) {
            this.updateStatus('connecting');
            this.abortController = new AbortController();
            
            // Re-initialize pending tables for delta-on-connect
            this.pendingTables = new Set(['journalEntries', 'prompts', 'teamsApp', 'teamMembers']);
            this.erroredTables.clear();

            try {
                const lastSyncTimestamps = await this.getLatestTimestamps();

                const stream = await orpcFetch.sync.heartbeatSync({ lastSyncTimestamps }, { signal: this.abortController.signal });
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