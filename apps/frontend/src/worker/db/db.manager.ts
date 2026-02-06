import { PGlite } from '@electric-sql/pglite';

export class DBManager {
  private pglite: PGlite | null = null;
  private initialized = false;

  constructor(private readonly path: string) {}

  async init() {
    if (this.initialized) return;

    this.pglite = new PGlite(this.path);
    
    // Exact schema match for journal_entries
    await this.pglite.exec(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        journal_entry_id VARCHAR(26) PRIMARY KEY,
        content TEXT NOT NULL,
        author_user_id UUID NOT NULL,
        prompt TEXT,
        prompt_id SMALLINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.initialized = true;
    console.info('[DBManager] Initialized and schema applied');
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.pglite) throw new Error('DB not initialized');
    
    const result = await this.pglite.query<T>(sql, params);
    return result.rows;
  }

  async exec(sql: string): Promise<void> {
    if (!this.pglite) throw new Error('DB not initialized');
    await this.pglite.exec(sql);
  }
}
