import { clientDb, subscribe, type AppDbTable } from "../db/db.manager";
import { filesDb } from "../db/files.db";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { getMediaProxyInternal } from "../worker.context";
import { orpcFetch } from "../../utils/orpc.client";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { StoredFile } from "../db/schema.db.types";
import { SSE_MESSAGES_CHANNEL, type SseMessage } from "../../configs/channels.config";
import { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";

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
      await Promise.all([
        this.syncTable('journalEntries'),
        this.syncTable('teamsApp'),
        this.syncTable('teamMembers'),
        // Prompts are usually server-to-client, but we check for consistency
        this.syncTable('prompts')
      ]);

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
    const action = record._pendingAction;
    
    // Special handling for journalEntries due to media
    if (tableName === 'journalEntries') {
      await this.orchestrateJournalEntry(record);
      return;
    }

    // Generic sync for other tables (simplified for this task)
    // In a real app, prompts/teams might have different endpoints
    try {
      if (action === 'create' || action === 'update') {
        const result = await this.pushToBackend(tableName, action, record);
        await this.handleSuccess(tableName, record, result);
      } else if (action === 'delete') {
        await this.pushDeleteToBackend(tableName, record);
        const table = clientDb[tableName];
        await table.where("id").equals(record.id).delete();
      }
    } catch (err: any) {
      throw err;
    }
  }

  private async orchestrateJournalEntry(record: any) {
    const entryId = record.id;
    const action = record._pendingAction;

    if (action === 'delete') {
      try {
        await orpcFetch.journalEntries.delete({ id: entryId });
        await clientDb.journalEntries.delete(entryId);
      } catch (err: any) {
        console.error(`[SyncOrchestrator] Failed to delete entry ${entryId}`, err);
      }
      return;
    }

    // Handle Media first
    const files = await filesDb.getFilesByPendingSyncId(entryId);
    const mediaProxy = getMediaProxyInternal();
    if (!mediaProxy) return;

    let allMediaReady = true;
    const attachmentUrls: ([string, string] | null)[] = [];

    // Note: attachmentFileIds should be on the record
    const fileIds = record.attachmentFileIds || [];

    for (const fileId of fileIds) {
      const file = files.find((f: StoredFile) => f.fileId === fileId);
      if (!file) {
        attachmentUrls.push(null);
        continue;
      }

      // Thumbnail check
      if (file.thumbnailStatus !== 'completed' && file.mimeType.startsWith("image/")) {
        allMediaReady = false;
        // Trigger thumbnail in background (don't block loop, but we can't sync yet)
        this.triggerThumbnail(fileId, file, mediaProxy);
        attachmentUrls.push(null);
        continue;
      }

      // Upload check
      if (file.status !== 'completed') {
        allMediaReady = false;
        this.triggerUpload(fileId, file, mediaProxy);
        attachmentUrls.push(null);
        continue;
      }

      if (file.cdnUrls) {
        attachmentUrls.push(file.cdnUrls as [string, string]);
      } else {
        attachmentUrls.push(null);
      }
    }

    if (!allMediaReady) return;

    // Media is ready, push to backend
    const validUrls = attachmentUrls.filter((u): u is [string, string] => u !== null);
    
    try {
      let result;
      if (action === 'create') {
        result = await orpcFetch.journalEntries.create({
          ...record,
          attachmentUrls: validUrls
        });
      } else {
        // @ts-ignore - update procedure recently added to backend, types might not be synced yet
        result = await orpcFetch.journalEntries.update({
          ...record,
          attachmentUrls: validUrls
        });
      }
      await this.handleSuccess('journalEntries', record, result);
    } catch (err: any) {
      console.error(`[SyncOrchestrator] Backend sync failed for entry ${entryId}`, err);
    }
  }

  private async triggerThumbnail(fileId: string, file: StoredFile, mediaProxy: any) {
    if (file.thumbnailStatus === 'in-progress') return;
    try {
      await filesDb.update(fileId, { thumbnailStatus: 'in-progress' });
      const blobFile = new File([file.blob], "original", { type: file.mimeType });
      const result = await mediaProxy.media.generateThumbnail(blobFile);
      if (result.thumbnailFile) {
        await filesDb.update(fileId, { 
          thumbnailBlob: result.thumbnailFile, 
          thumbnailStatus: 'completed' 
        });
      }
    } catch (e) {
      await filesDb.update(fileId, { thumbnailStatus: 'failed' });
    }
  }

  private async triggerUpload(fileId: string, file: StoredFile, mediaProxy: any) {
    if (file.status === 'in-progress') return;
    try {
      await filesDb.update(fileId, { status: 'in-progress' });
      const blobFile = new File([file.blob], "original", { type: file.mimeType });
      const thumbFile = file.thumbnailBlob ? new File([file.thumbnailBlob], "thumb", { type: file.thumbnailBlob.type }) : undefined;
      const result = await mediaProxy.media.uploadMediaPair(blobFile, thumbFile);
      if (result.success && result.urls) {
        await filesDb.update(fileId, { 
          cdnUrls: result.urls, 
          status: 'completed' 
        });
      }
    } catch (e) {
      await filesDb.update(fileId, { status: 'failed' });
    }
  }

  private async handleSuccess(tableName: TablesToSync, localRecord: any, serverRecord: any) {
    const table = clientDb[tableName];
    const recordIdField = this.getRecordIdField(tableName);
    
    await table.put({
      ...serverRecord,
      _pendingAction: null,
    });
    console.info(`[SyncOrchestrator] Successfully synced ${tableName}:${localRecord[recordIdField]}`);
  }

  private getRecordIdField(tableName: TablesToSync): string {
    switch (tableName) {
      case 'journalEntries': return 'id';
      case 'prompts': return 'id';
      case 'teamsApp': return 'id';
      case 'teamMembers': return 'id';
      default: return 'id';
    }
  }

  private async pushToBackend(tableName: TablesToSync, action: 'create' | 'update', record: any) {
    // This is a placeholder for actual oRPC calls per table
    // For now, we only have id/teamId as relevant fields
    if (tableName === 'journalEntries') {
       // Handled in orchestrateJournalEntry
       return;
    }
    // Generic fallback or specific handlers for other tables
    throw new Error(`Push handler not implemented for ${tableName}`);
  }

  private async pushDeleteToBackend(tableName: string, record: any) {
    if (tableName === 'journalEntries') {
      return await orpcFetch.journalEntries.delete({ id: record.id });
    }
    throw new Error(`Delete handler not implemented for ${tableName}`);
  }
}

export const syncOrchestrator = new SyncOrchestrator();
