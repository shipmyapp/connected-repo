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
  }

  private isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
  }

  public start() {
    console.info("[SyncOrchestrator] Service started.");
    this.processQueue();
  }

  public async processQueue() {
    if (this.isProcessing) return;
    if (!this.isOnline()) return;

    this.isProcessing = true;
    try {
      console.debug("[SyncOrchestrator] Starting sync scan...");
      
      // We process tables in order of dependency if any, but mostly concurrent is fine
      await Promise.all(TABLES_TO_SYNC_ENUM.map((tableName) => this.syncTable(tableName)));

    } catch (err) {
      console.error("[SyncOrchestrator] Global sync error:", err);
    } finally {
      this.isProcessing = false;
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

      try {
        this.inFlightSyncs.add(syncKey);
        await this.syncRecord(tableName, record);
      } catch (err) {
        console.error(`[SyncOrchestrator] Error syncing ${syncKey}:`, err);
      } finally {
        this.inFlightSyncs.delete(syncKey);
      }
    }
    console.groupEnd();
  }

  private async syncRecord(tableName: TablesToSync, record: any) {
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

    // Check if all files are synced on backend
    const entryFiles = await filesDb.getFilesByTableId(entryId);
    let allFilesSyncedOnBackend = true;
    
    for (const file of entryFiles) {
      if (file._pendingAction !== null) {
        allFilesSyncedOnBackend = false;
        break;
      }
    }

    if (!allFilesSyncedOnBackend) {
        console.debug(`[SyncOrchestrator] JournalEntry ${entryId} waiting for files to sync...`);
        return;
    }

    // All files are synced, push entry to backend
    try {
      let result;
      if (action === 'create') {
        const { _pendingAction, status, error, errorCount, ...data } = record;
        result = await orpcFetch.journalEntries.create(data);
      }
      await this.handleSuccess('journalEntries', record, result);
    } catch (err: any) {
      console.error(`[SyncOrchestrator] Backend sync failed for entry ${entryId}`, err);
    }
  }

  private async orchestrateFile(file: StoredFile) {
    const fileId = file.id;
    const action = file._pendingAction;
    const mediaProxy = getMediaProxyInternal();
    if (!mediaProxy) return;

    // 1. Thumbnail check
    if (file._thumbnailStatus !== 'completed' && file.mimeType.startsWith("image/")) {
      await this.triggerThumbnail(fileId, file, mediaProxy);
      return;
    }

    // 2. Upload check
    if (file._status !== 'completed') {
      await this.triggerUpload(fileId, file, mediaProxy);
      return;
    }

    // 3. Push to backend
    try {
      let result;
      if (action === 'create') {
        const { _blob, _thumbnailBlob, _status, _error, _errorCount, _thumbnailStatus, _pendingAction, ...syncData } = file;
        result = await orpcFetch.files.create(syncData);
      }
      await this.handleSuccess('files', file, result);
    } catch (err: any) {
      console.error(`[SyncOrchestrator] Backend sync failed for file ${fileId}`, err);
    }
  }

  private async triggerThumbnail(fileId: string, file: StoredFile, mediaProxy: any) {
    if (file._thumbnailStatus === 'in-progress') return;
    try {
      await filesDb.update(fileId, { _thumbnailStatus: 'in-progress' });
      const blobFile = new File([file._blob!], "original", { type: file.mimeType });
      const result = await mediaProxy.media.generateThumbnail(blobFile);
      if (result.thumbnailFile) {
        await filesDb.update(fileId, { 
          _thumbnailBlob: result.thumbnailFile, 
          _thumbnailStatus: 'completed' 
        });
      }
    } catch (e) {
      await filesDb.update(fileId, { _thumbnailStatus: 'failed' });
    }
  }

  private async triggerUpload(fileId: string, file: StoredFile, mediaProxy: any) {
    if (file._status === 'in-progress') return;
    try {
      await filesDb.update(fileId, { _status: 'in-progress' });
      const blobFile = new File([file._blob!], "original", { type: file.mimeType });
      const thumbFile = file._thumbnailBlob ? new File([file._thumbnailBlob], "thumb", { type: file._thumbnailBlob.type }) : undefined;
      const result = await mediaProxy.media.uploadMediaPair(blobFile, thumbFile);
      if (result.success && result.urls) {
        await filesDb.update(fileId, { 
          cdnUrl: result.urls[0],
          thumbnailCdnUrl: result.urls[1],
          _status: 'completed' 
        });
      }
    } catch (e) {
      await filesDb.update(fileId, { _status: 'failed' });
    }
  }

  private async handleSuccess(tableName: TablesToSync, localRecord: any, serverRecord: any) {
    const table = clientDb[tableName];
    const recordIdField = this.getRecordIdField(tableName);
    
    await table.put({
      ...serverRecord,
      _pendingAction: null,
    });
    console.info(`[SyncOrchestrator] Successfully synced ${tableName}:${localRecord[recordIdField]} (server id: ${serverRecord.id})`);
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
