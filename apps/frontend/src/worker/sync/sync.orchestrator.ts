import { type Table } from "dexie";
import { clientDb, subscribe, type AppDbTable } from "../db/db.manager";
import { filesDb } from "../db/files.db";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { getMediaProxyInternal } from "../worker.context";
import { orpcFetch } from "../../utils/orpc.client";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { StoredFile } from "../db/schema.db.types";
import { SSE_MESSAGES_CHANNEL, type SseMessage } from "../../configs/channels.config";
import { TABLES_TO_SYNC_ENUM, TablesToSync } from "@connected-repo/zod-schemas/enums.zod";

export class SyncOrchestrator {
  private isProcessing = false;
  private sseChannel: BroadcastChannel | null = null;
  private inFlightSyncs = new Set<string>(); // "tableName:recordId"
  private retryCounts = new Map<string, number>(); // "tableName:recordId" -> count
  private needsRescan = false;

  constructor() {
    // 1. Listen for SSE events to trigger sync
    this.sseChannel = new BroadcastChannel(SSE_MESSAGES_CHANNEL);
    this.sseChannel.onmessage = (event) => {
      const message = event.data as SseMessage;
      if (message.type === 'SSE_HEARTBEAT' || message.type === 'SSE_CONNECTED') {
        this.processQueue();
      }
    };

    // 2. Listen for local DB changes to trigger sync
    subscribe((table: AppDbTable) => {
      // If we change something locally, try to push it
      if (['journalEntries', 'prompts', 'teamsApp', 'teamMembers', 'files'].includes(table)) {
        this.processQueue();
      }
    });

    // 3. Listen for online status restoration
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.processQueue());
    } else if (typeof self !== 'undefined') {
      self.addEventListener('online', () => this.processQueue());
    }
  }

  private isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
  }

  public async start() {
    console.info("[SyncOrchestrator] Service started.");
    this.processQueue();
  }

  public async processQueue() {
    if (this.isProcessing) {
        this.needsRescan = true;
        return;
    }
    if (!this.isOnline()) return;

    this.isProcessing = true;
    this.needsRescan = false;
    try {
      // Sequential table processing for dependency resolution
      const syncOrder: TablesToSync[] = ['teamsApp', 'teamMembers', 'prompts', 'journalEntries', 'files'];
      for (const tableName of syncOrder) {
        await this.syncTable(tableName);
      }
    } catch (err) {
      console.error("[SyncOrchestrator] Global sync error:", err);
    } finally {
      this.isProcessing = false;
      if (this.needsRescan) {
        this.needsRescan = false;
        this.processQueue();
      }
    }
  }

  private async syncTable(tableName: TablesToSync) {
    const table = clientDb[tableName];
    if (!table) return;

    // Find all records with a pending action
    const pendingRecords = await table
      .filter((r: any) => r._pendingAction !== null)
      .toArray();

    if (pendingRecords.length === 0) return;

    console.group(`[SyncOrchestrator] Table: ${tableName} (${pendingRecords.length} pending)`);
    for (const record of pendingRecords) {
      const syncKey = `${tableName}:${record.id}`;
      
      if (this.inFlightSyncs.has(syncKey)) continue;

      // --- Exponential Backoff Check ---
      const retryCount = this.retryCounts.get(syncKey) || 0;
      if (retryCount > 0) {
        const lastAttempt = (record as any)._lastSyncAttemptAt || 0;
        const delay = Math.min(300000, Math.pow(2, retryCount) * 2000); // Max 5 mins
        if (Date.now() - lastAttempt < delay) {
          continue; // Skip for now
        }
      }

      try {
        this.inFlightSyncs.add(syncKey);
        await this.syncRecord(tableName, record);
        this.retryCounts.delete(syncKey); // Success!
      } catch (err) {
        console.error(`[SyncOrchestrator] Error syncing ${syncKey}:`, err);
        const nextRetry = (this.retryCounts.get(syncKey) || 0) + 1;
        this.retryCounts.set(syncKey, nextRetry);
        
        // Update record with last attempt timestamp (locally)
        await (table as Table<any, any>).update(record.id, { _lastSyncAttemptAt: Date.now() });
      } finally {
        this.inFlightSyncs.delete(syncKey);
      }
    }
    console.groupEnd();
  }

  private async syncRecord(tableName: TablesToSync, record: any) {
    if (record._pendingAction && record._pendingAction !== 'create') {
      console.error(`[SyncOrchestrator] Unsupported offline action "${record._pendingAction}" on ${tableName}:${record.id}. Sync model requires online-only for synced records.`);
      // We don't throw here to avoid blocking the queue, but we don't proceed either.
      return;
    }

    if (tableName === 'journalEntries') {
      await this.orchestrateJournalEntry(record);
      return;
    }

    if (tableName === 'files') {
      await this.orchestrateFile(record);
      return;
    }

    console.warn(`[SyncOrchestrator] No sync handler for table: ${tableName}`);
  }

  private async orchestrateJournalEntry(record: any) {
    const entryId = record.id;
    const action = record._pendingAction;

    // Decoupled: Push entry to backend immediately
    try {
      console.log(`[SyncOrchestrator] Orchestrating JournalEntry ${entryId} (${action})`);
      let result;
      if (action === 'create') {
        const { _pendingAction, ...data } = record;
        result = await orpcFetch.journalEntries.create(data);
      }
      await this.handleSuccess('journalEntries', record, result);
    } catch (err: any) {
      console.error(`[SyncOrchestrator] Backend sync failed for entry ${entryId}`, err);
      throw err; // Re-throw to be caught by syncTable for retry logic
    }
  }

  private async orchestrateFile(file: StoredFile) {
    const fileId = file.id;
    const mediaProxy = getMediaProxyInternal();
    if (!mediaProxy) return;

    // 0. Parent Check: Only process files if parent entry exists AND is synced on server
    const parentEntry = await clientDb.journalEntries.get(file.tableId);
    if (!parentEntry || parentEntry._pendingAction !== null) return;

    // Linear flow determined by data presence
    let currentFile = file;

    // 1. Thumbnail Stage (If needed and missing)
    const isMedia = currentFile.mimeType.startsWith("image/") || currentFile.mimeType === "application/pdf";
    if (isMedia && !currentFile.thumbnailCdnUrl && !currentFile._thumbnailBlob) {
      await this.triggerThumbnail(fileId, currentFile, mediaProxy);
      const updated = await filesDb.get(fileId);
      if (!updated) return;
      currentFile = updated;
    }

    // 2. Upload Stage (If missing CDN URL)
    if (!currentFile.cdnUrl) {
      await this.triggerUpload(fileId, currentFile, mediaProxy);
      const updated = await filesDb.get(fileId);
      if (!updated) return;
      currentFile = updated;
    }

    // 3. Sync Stage (Metadata to backend)
    if (currentFile.cdnUrl && currentFile._pendingAction === 'create') {
        try {
            const { _blob, _thumbnailBlob, _pendingAction, ...syncData } = currentFile;
            const result = await orpcFetch.files.create(syncData);
            await this.handleSuccess('files', currentFile, result);
        } catch (err: any) {
            console.error(`[SyncOrchestrator] Metadata sync failed for ${fileId}`, err);
            throw err; // Trigger retry backoff
        }
    }
  }

  private async triggerThumbnail(fileId: string, file: StoredFile, mediaProxy: any) {
    try {
      if (!file._blob) return;

      const blobFile = new File([file._blob], file.fileName, { type: file.mimeType });
      const result = await mediaProxy.media.generateThumbnail(blobFile);
      if (result.thumbnailFile) {
        await filesDb.update(fileId, { 
          _thumbnailBlob: result.thumbnailFile
        });
      }
    } catch (e) {
      console.error(`[SyncOrchestrator] Thumbnail fail for ${fileId}`, e);
      throw e;
    }
  }

  private async triggerUpload(fileId: string, file: StoredFile, mediaProxy: any) {
    try {
      if (!file._blob) return;

      const blobFile = new File([file._blob], file.fileName, { type: file.mimeType });
      (blobFile as any).id = fileId; 
      
      const thumbFile = file._thumbnailBlob ? new File([file._thumbnailBlob], "thumb", { type: file._thumbnailBlob.type }) : undefined;
      if (thumbFile) (thumbFile as any).id = `${fileId}_thumb`;

      const result = await mediaProxy.media.uploadMediaPair(blobFile, thumbFile);
      if (result.success && result.urls) {
        await filesDb.update(fileId, { 
          cdnUrl: result.urls[0],
          thumbnailCdnUrl: result.urls[1] || null
        });
      }
    } catch (e: any) {
      console.error(`[SyncOrchestrator] CDN upload fail for ${fileId}`, e);
      throw e;
    }
  }

  private async handleSuccess(tableName: TablesToSync, localRecord: any, serverRecord: any) {
    const table = clientDb[tableName];
    const recordIdField = this.getRecordIdField(tableName);
    const recordId = localRecord[recordIdField];

    // Merge with existing local data to preserve blobs/status
    const existing = await table.get(recordId);
    
    await table.put({
      ...existing,
      ...serverRecord,
      _pendingAction: null,
    });
    this.needsRescan = true;
    console.info(`[SyncOrchestrator] Successfully synced ${tableName}:${recordId} (server id: ${serverRecord.id})`);
  }

  private getRecordIdField(tableName: TablesToSync): string {
    switch (tableName) {
      case 'journalEntries': return 'id';
      case 'prompts': return 'id';
      case 'teamsApp': return 'id';
      case 'teamMembers': return 'id';
      case 'files': return 'id';
      default: return 'id';
    }
  }


}

export const syncOrchestrator = new SyncOrchestrator();
