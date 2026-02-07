import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { SimpleCsrfProtectionLinkPlugin } from '@orpc/client/plugins';
import type { UserAppRouter } from "../../../../backend/src/routers/user_app/user_app.router";

export type SSEStatus = 'connected' | 'disconnected' | 'connecting';

export class SSEManager {
    private currentStatus: SSEStatus = 'disconnected';
    private statusListeners = new Set<(status: SSEStatus) => void>();
    private abortController: AbortController | null = null;
    private heartbeatTimer: number | null = null;
    private HEARTBEAT_TIMEOUT = 15000; // 15s
    private isMonitoring = false;
    private retryAbortController: AbortController | null = null;
    private retryCount = 0;

    private updateStatus(status: SSEStatus) {
        if (this.currentStatus !== status) {
            console.info(`[SSE] Status changed: ${this.currentStatus} -> ${status}`);
        }
        this.currentStatus = status;
        this.statusListeners.forEach(cb => {
            try { 
                cb(status); 
                // console.debug(`[SSE] Successfully notified a listener`);
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
        // NOTE: window.setTimeout is not available in SW. Using global setTimeout.
        this.heartbeatTimer = setTimeout(() => {
            console.warn('[SSE] Heartbeat timeout. Restarting...');
            this.abortController?.abort();
        }, this.HEARTBEAT_TIMEOUT) as unknown as number;
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
            this.abortController.abort(); // Immediately break the current fetch/stream
        }
        if (this.retryAbortController) {
            this.retryAbortController.abort();
        }
        this.updateStatus('disconnected');
    }

    public async reconnect() {
        console.info('[SSE] Manual reconnection triggered');
        this.retryCount = 0; // Reset backoff
        if (this.retryAbortController) {
            this.retryAbortController.abort(); // Break the current delay sleep
        }
    }

    public async startMonitoring(apiUrl: string) {
        if (this.isMonitoring) return; // Prevent multiple loops
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

            try {
                const stream = await orpc.sync.heartbeatSync({}, { signal: this.abortController.signal });
                this.updateStatus('connected');
                this.resetHeartbeatWatchdog();
                this.retryCount = 0; // Reset on successful connection

                for await (const event of stream) {
                    console.debug(`[SSE] Received event type: ${event.type}`);
                    if (!this.isMonitoring) break; // Exit if stopped during stream
                    // Reset watchdog on ANY event (data or heartbeat)
                    this.resetHeartbeatWatchdog();
                    
                    if (event.type === 'heartbeat') {
                        console.debug('[SSE] Heartbeat received');
                    }
                    // Handle other events...
                }
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') {
                    continue;
                }
                console.error('[SSE] Connection lost or failed to establish:', err);
                if (err instanceof Error) {
                    console.error(`[SSE] Error details: ${err.name} - ${err.message}\n${err.stack}`);
                }
            } finally {
                this.updateStatus('disconnected');
                if (this.heartbeatTimer) {
                    clearTimeout(this.heartbeatTimer);
                }

                if(this.isMonitoring) {
                    // Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
                    const backoff = Math.min(30000, Math.pow(2, this.retryCount) * 1000);
                    
                    // Jitter: adds or subtracts up to 20% of the wait time randomly
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
                        if (e instanceof Error && e.message === 'RetryAborted') {
                            console.info('[SSE] Retry delay aborted for immediate reconnection');
                        } else {
                            throw e; // Re-throw other errors
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