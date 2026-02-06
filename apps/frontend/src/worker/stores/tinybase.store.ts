import { createStore, type Store } from 'tinybase';

/**
 * TinyBase cell types don't support `null`, so nullable fields use a
 * companion `_isNull_<field>` boolean.  When `_isNull_<field>` is `true`,
 * the real cell value should be ignored (treated as `null`).
 */

export function createDataStore(): Store {
  return createStore()
    // ── Leads ──────────────────────────────────────────────────
    .setTablesSchema({
      leads: {
        leadId: { type: 'string' },
        contactName: { type: 'string' },
        companyName: { type: 'string', default: '' },
        _isNull_companyName: { type: 'boolean', default: true },
        jobTitle: { type: 'string', default: '' },
        _isNull_jobTitle: { type: 'boolean', default: true },
        email: { type: 'string', default: '' },
        _isNull_email: { type: 'boolean', default: true },
        phone: { type: 'string', default: '' },
        _isNull_phone: { type: 'boolean', default: true },
        website: { type: 'string', default: '' },
        _isNull_website: { type: 'boolean', default: true },
        address: { type: 'string', default: '' },
        _isNull_address: { type: 'boolean', default: true },
        notes: { type: 'string', default: '' },
        _isNull_notes: { type: 'boolean', default: true },
        capturedByUserId: { type: 'string' },
        teamId: { type: 'string', default: '' },
        _isNull_teamId: { type: 'boolean', default: true },
        createdAt: { type: 'number' },
        updatedAt: { type: 'number' },
        visitingCardFrontUrl: { type: 'string', default: '' },
        _isNull_visitingCardFrontUrl: { type: 'boolean', default: true },
        visitingCardBackUrl: { type: 'string', default: '' },
        _isNull_visitingCardBackUrl: { type: 'boolean', default: true },
        voiceNoteUrl: { type: 'string', default: '' },
        _isNull_voiceNoteUrl: { type: 'boolean', default: true },
        _isPending: { type: 'boolean', default: false },
      },
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
      uploads: {
        id: { type: 'string' },
        leadId: { type: 'string' },
        localUrl: { type: 'string' },
        remoteUrl: { type: 'string', default: '' },
        _isNull_remoteUrl: { type: 'boolean', default: true },
        type: { type: 'string' }, // 'image' | 'voice'
        fileType: { type: 'string', default: '' },
        field: { type: 'string' }, // 'visitingCardFrontUrl' | 'visitingCardBackUrl' | 'voiceNoteUrl'
        status: { type: 'string', default: 'pending' }, // 'pending' | 'uploading' | 'done' | 'error'
        error: { type: 'string', default: '' },
        createdAt: { type: 'number' },
      },
      syncMetadata: {
        tableName: { type: 'string' },
        lastSyncedAt: { type: 'number' },
      },
    });
}
