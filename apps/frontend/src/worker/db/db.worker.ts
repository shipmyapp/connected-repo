import * as Comlink from 'comlink';
import { DBManager } from './db.manager';

// Initialize the DBManager with IndexedDB persistence
const dbManager = new DBManager('idb://app_db_v1');

// Expose the dbManager instance using Comlink
Comlink.expose(dbManager);

console.info('[DBWorker] Worker initialized and DBManager exposed');
