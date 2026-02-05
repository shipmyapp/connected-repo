import { createStore, type Store } from 'tinybase';

/**
 * TinyBase cell types don't support `null`, so nullable fields use a
 * companion `_isNull_<field>` boolean.  When `_isNull_<field>` is `true`,
 * the real cell value should be ignored (treated as `null`).
 */

export function createDataStore(): Store {
  return createStore()
    // ── Journal Entries ───────────────────────────────────────────
    .setTablesSchema({
      journalEntries: {
        journalEntryId: { type: 'string' },
        content: { type: 'string' },
        authorUserId: { type: 'string' },
        prompt: { type: 'string', default: '' },
        _isNull_prompt: { type: 'boolean', default: true },
        promptId: { type: 'number', default: 0 },
        _isNull_promptId: { type: 'boolean', default: true },
        createdAt: { type: 'number' },
        updatedAt: { type: 'number' },
        _isPending: { type: 'boolean', default: false },
      },
      // ── Prompts ───────────────────────────────────────────────────
      prompts: {
        promptId: { type: 'number' },
        text: { type: 'string' },
        category: { type: 'string', default: '' },
        _isNull_category: { type: 'boolean', default: true },
        tags: { type: 'string', default: '[]' }, // JSON-encoded string[]
        _isNull_tags: { type: 'boolean', default: true },
        isActive: { type: 'boolean' },
        createdAt: { type: 'number' },
        updatedAt: { type: 'number' },
      },
      // ── Pending entries ───────────────────────────────────────────
      pending_entries: {
        id: { type: 'string' },
        entity: { type: 'string' },
        operation: { type: 'string' },
        payload: { type: 'string' }, // JSON-serialized
        status: { type: 'string', default: 'pending' },
        retryCount: { type: 'number', default: 0 },
        createdAt: { type: 'number' },
        nextRetryAt: { type: 'number', default: 0 },
      },
      // ── Sync Metadata ─────────────────────────────────────────────
      syncMeta: {
        key: { type: 'string' },
        value: { type: 'string' },
      },
    });
}
