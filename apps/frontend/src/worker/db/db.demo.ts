import { getDBProxy } from './db.proxy';
import type { JournalEntrySelectAll } from '@connected-repo/zod-schemas/journal_entry.zod';

/**
 * Demo function to verify PGlite is working and persisting data.
 */
export const runDBDemo = async () => {
    try {
        console.log('[DBDemo] Starting PGlite foundation test...');
        
        // getDBProxy ensures init() is called and awaited exactly once
        const db = await getDBProxy();
        
        // 1. Basic SELECT 1 test as requested
        const ping = await db.query('SELECT 1 as result') as { result: number }[];
        console.log('[DBDemo] SELECT 1 result:', ping);

        // 2. Foundation DDL verification (INSERT/SELECT)
        const testId = `journal_${Date.now()}`;
        await db.query(`
            INSERT INTO journal_entries (journal_entry_id, content, author_user_id)
            VALUES ($1, $2, $3)
        `, [testId, 'Senior Engineer PGlite test', '00000000-0000-0000-0000-000000000001']);
        
        const entries = await db.query('SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT 1') as JournalEntrySelectAll[];
        
        console.log('[DBDemo] Latest foundation entry:', entries[0]);
        console.log('[DBDemo] ✅ Foundation verified successfully.');
        
    } catch (error) {
        console.error('[DBDemo] ❌ Foundation verification failed:', error);
    }
};
