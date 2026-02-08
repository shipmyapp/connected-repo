import type { ConnectivityChangeEvent } from '../worker.types';

export class ConnectivityService {
  private _isOnline = false;
  private _sseStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private _broadcast: (event: ConnectivityChangeEvent) => void;
  private _internalListeners = new Set<(status: { isOnline: boolean; isServerReachable: boolean }) => void>();

  constructor(broadcast: (event: ConnectivityChangeEvent) => void) {
    this._broadcast = broadcast;
  }

  onStatusChange(listener: (status: { isOnline: boolean; isServerReachable: boolean }) => void): () => void {
    this._internalListeners.add(listener);
    // Call immediately with the current state to avoid missing initial status
    try {
      listener({ isOnline: this._isOnline, isServerReachable: this.isServerReachable });
    } catch (err) {
      console.error('[ConnectivityService] Error in immediate status callback:', err);
    }
    return () => this._internalListeners.delete(listener);
  }

  get isOnline(): boolean {
    return this._isOnline;
  }

  get isServerReachable(): boolean {
    return this._isOnline && this._sseStatus === 'connected';
  }

  setSseStatus(status: typeof this._sseStatus): void {
    if (this._sseStatus === status) return;
    console.log(`[ConnectivityService] SSE Status update: ${this._sseStatus} -> ${status}`);
    this._sseStatus = status;
    this._emitChange();
  }

  start(): void {
    // Initial state from navigator (Worker has access to navigator.onLine)
    this._isOnline = navigator.onLine;

    // Listen for online/offline in the Worker scope
    self.addEventListener('online', () => {
      this._isOnline = true;
      this._emitChange();
    });
    self.addEventListener('offline', () => {
      this._isOnline = false;
      this._emitChange();
    });

    this._emitChange();
  }

  stop(): void {
  }

  private _emitChange(): void {
    const status = {
      isOnline: this._isOnline,
      isServerReachable: this.isServerReachable,
    };

    console.log(`[ConnectivityService] Broadcasting change:`, status);

    this._broadcast({
      type: 'push',
      event: 'connectivity-change',
      payload: status,
    });

    for (const listener of this._internalListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[ConnectivityService] Internal listener error:', err);
      }
    }
  }
}
