import type { Store } from 'tinybase';

export type StorageRow = Record<string, string | number | boolean>;

export interface StorageEngine {
  init(): Promise<void>;
  getAll(table: string): StorageRow[];
  getRow(table: string, id: string): StorageRow | null;
  setRow(table: string, id: string, row: StorageRow): void;
  delRow(table: string, id: string): void;
  clearTable(table: string): void;
  getSortedRowIds(table: string, cellId: string, descending: boolean): string[];
  transaction(cb: () => void): void;
}

export class TinyBaseStorageEngine implements StorageEngine {
  constructor(private store: Store) {}

  async init(): Promise<void> {
    // Initialization logic if any (persisters are handled separately)
  }

  getAll(table: string): StorageRow[] {
    const ids = this.store.getRowIds(table);
    return ids.map(id => this.store.getRow(table, id) as StorageRow);
  }

  getRow(table: string, id: string): StorageRow | null {
    const row = this.store.getRow(table, id);
    return Object.keys(row).length > 0 ? (row as StorageRow) : null;
  }

  setRow(table: string, id: string, row: StorageRow): void {
    this.store.setRow(table, id, row);
  }

  delRow(table: string, id: string): void {
    this.store.delRow(table, id);
  }

  clearTable(table: string): void {
    const ids = this.store.getRowIds(table);
    for (const id of ids) {
      this.store.delRow(table, id);
    }
  }

  getSortedRowIds(table: string, cellId: string, descending: boolean): string[] {
    return this.store.getSortedRowIds(table, cellId, descending);
  }

  transaction(cb: () => void): void {
    this.store.transaction(cb);
  }
}

// TODO: Implement PGliteStorageEngine for Capacitor
