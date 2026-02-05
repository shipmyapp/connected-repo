import { EventPublisher } from '@orpc/server';
import type { JournalEntrySelectAll } from '@connected-repo/zod-schemas/journal_entry.zod';
import type { PromptSelectAll } from '@connected-repo/zod-schemas/prompt.zod';

export type SyncPayload = 
  | { type: 'journalEntries'; userId: string; data: JournalEntrySelectAll[]; operation: 'create' | 'update' | 'delete' }
  | { type: 'prompts'; data: PromptSelectAll[]; operation: 'create' | 'update' | 'delete' }
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
