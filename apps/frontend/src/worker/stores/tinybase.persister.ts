import type { Store } from 'tinybase';
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db';

const DB_NAME = 'oneq-data-store';

/**
 * Creates an IndexedDB persister for the TinyBase store and starts
 * bidirectional auto-sync (auto-load from DB + auto-save to DB).
 */
export async function createAndStartPersister(store: Store) {
  const persister = createIndexedDbPersister(store, DB_NAME);

  // Load existing data from IndexedDB into the store
  await persister.startAutoLoad();
  // Persist any future changes from the store back to IndexedDB
  await persister.startAutoSave();

  return persister;
}
