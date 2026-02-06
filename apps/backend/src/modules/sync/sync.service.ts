import { EventPublisher } from '@orpc/server';
import type { LeadSelectAll } from '@connected-repo/zod-schemas/leads.zod';

export type SyncPayload = 
  | { type: 'leads'; userId: string; data: LeadSelectAll[]; operation: 'create' | 'update' | 'delete' }
  | { type: 'heartbeat' };

export class SyncService {
  private publisher = new EventPublisher<{
    'data-change': SyncPayload;
  }>();

  constructor() {
    // Proactive heartbeat to keep connections alive and allow clients to detect server death.
    setInterval(() => {
      this.push({ type: 'heartbeat' });
    }, 15000);
  }

  subscribe(signal?: AbortSignal) {
    return this.publisher.subscribe('data-change', { signal });
  }

  push(payload: SyncPayload) {
    this.publisher.publish('data-change', payload);
  }
}

export const syncService = new SyncService();
