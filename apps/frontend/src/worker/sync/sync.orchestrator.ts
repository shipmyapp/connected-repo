import { type Table } from "dexie";
import { clientDb, subscribe, type AppDbTable } from "../db/db.manager";
import { filesDb } from "../db/files.db";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { orpcFetch } from "../../utils/orpc.client";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import { StoredFile } from "../db/schema.db.types";
import { IdentifiedFile } from "../cdn/cdn.types";
import { SSE_MESSAGES_CHANNEL, type SseMessage } from "../../configs/channels.config";
import { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import { type Remote } from "comlink";
import { type MediaWorkerAPI } from "../media.worker";

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
    await filesDb.handleOrphanedFiles();
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
      // Process tables in order
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
      .filter((r) => r._pendingAction !== null)
      .toArray();

    if (pendingRecords.length === 0) return;

    console.group(`[SyncOrchestrator] Table: ${tableName} (${pendingRecords.length} pending)`);
    
    if (tableName === 'files') {
      const allPendingFiles = (pendingRecords as any as StoredFile[]);
      
      // HYDRATION: Ensure Blobs are present from OPFS before batch processing
      await Promise.all(allPendingFiles.map(async f => {
        if (f._opfsPath && !f._blob) {
            const { OPFSManager } = await import("../utils/opfs.manager");
            f._blob = (await OPFSManager.readFile(f._opfsPath)) || undefined;
        }
        if (f._thumbnailOpfsPath && !f._thumbnailBlob) {
            const { OPFSManager } = await import("../utils/opfs.manager");
            f._thumbnailBlob = (await OPFSManager.readFile(f._thumbnailOpfsPath)) || undefined;
        }
      }));

      const recordsToProcess = allPendingFiles.filter(r => !this.inFlightSyncs.has(`${tableName}:${r.id}`));
      
      // 1. Batch Original Uploads
      const needingOriginalUpload = recordsToProcess.filter(r => !r.cdnUrl && r._blob);
      if (needingOriginalUpload.length > 0) {
        const { getMediaProxy } = await import("../worker.context");
        const mediaProxy = await getMediaProxy();
        
        // Process in chunks of 50 (backend now supports up to 100)
        for (let i = 0; i < needingOriginalUpload.length; i += 50) {
           const chunk = needingOriginalUpload.slice(i, i + 50);
           const filesToUpload = chunk.map(r => Object.assign(
             new File([r._blob!], r.fileName, { type: r.mimeType }),
             { id: r.id }
           ));
           
           const results = await mediaProxy.media.uploadFiles(filesToUpload);
           await Promise.all(results.map((res, idx) => {
             if (res.success && res.cdnUrl) {
               return filesDb.update(chunk[idx]!.id, { cdnUrl: res.cdnUrl });
             }
             return Promise.resolve();
           }));
        }
      }

      // 2. Batch Thumbnail Uploads
      const needingThumbnailUpload = recordsToProcess.filter(r => r._thumbnailBlob && !r.thumbnailCdnUrl);
      if (needingThumbnailUpload.length > 0) {
        const { getMediaProxy } = await import("../worker.context");
        const mediaProxy = await getMediaProxy();
        
        for (let i = 0; i < needingThumbnailUpload.length; i += 50) {
           const chunk = needingThumbnailUpload.slice(i, i + 50);
           const thumbsToUpload = chunk.map(r => Object.assign(
             new File([r._thumbnailBlob!], "thumb", { type: r._thumbnailBlob!.type }),
             { id: `${r.id}_thumb` }
           ));
           
           const results = await mediaProxy.media.uploadFiles(thumbsToUpload);
           await Promise.all(results.map((res, idx) => {
             if (res.success && res.cdnUrl) {
               return filesDb.update(chunk[idx]!.id, { thumbnailCdnUrl: res.cdnUrl });
             }
             return Promise.resolve();
           }));
        }
      }

      // 3. Process records individually for remaining stages (Metadata, gen thumbnail)
      // RE-FETCH: Batch uploads in Stages 1 & 2 updated the DB. 
      // We must re-fetch to see new CDN URLs, or Stage 3 will think they are still missing.
      const freshPending = await filesDb.getPendingActions();
      
      await Promise.all(freshPending.map(async (record) => {
        const syncKey = `${tableName}:${record.id}`;
        if (this.inFlightSyncs.has(syncKey)) return;

        try {
          this.inFlightSyncs.add(syncKey);
          await this.syncRecord(tableName, record);
          this.retryCounts.delete(syncKey);
        } catch (err) {
          console.error(`[SyncOrchestrator] Error syncing ${syncKey}:`, err);
          const nextRetry = (this.retryCounts.get(syncKey) || 0) + 1;
          this.retryCounts.set(syncKey, nextRetry);
          await (table as Table<any, any>).update(record.id, { _lastSyncAttemptAt: Date.now() });
        } finally {
          this.inFlightSyncs.delete(syncKey);
        }
      }));
    } else {
      for (const record of pendingRecords) {
        const syncKey = `${tableName}:${record.id}`;
        
        if (this.inFlightSyncs.has(syncKey)) continue;

        // --- Exponential Backoff Check ---
        const retryCount = this.retryCounts.get(syncKey) || 0;
        if (retryCount > 0) {
          const lastAttempt = record._lastSyncAttemptAt || 0;
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
    let currentFile = file;

    // Linear flow determined by data presence
    const isMedia = currentFile.mimeType.startsWith("image/") || currentFile.mimeType === "application/pdf";
    const needsMediaProxy = !currentFile.cdnUrl || (isMedia && !currentFile.thumbnailCdnUrl);

    let mediaProxy: Remote<MediaWorkerAPI> | null = null;
    if (needsMediaProxy) {
      const { getMediaProxy } = await import("../worker.context");
      mediaProxy = await getMediaProxy();
    }

    const tasks: Promise<void>[] = [];

    // 0. Recovery Mode: If blob is missing, check CDN
    if (!currentFile.cdnUrl && (!currentFile._blob || currentFile._blob.size === 0)) {
        if (currentFile._syncError === 'FILE_DATA_LOST') return; // Already skipped

        console.warn(`[SyncOrchestrator] Blob missing for ${fileId}, checking CDN for recovery...`);
        const { getMediaProxy } = await import("../worker.context");
        const mediaProxy = await getMediaProxy();
        const checkResult = await mediaProxy.cdn.checkFileExistsInCdn({
            id: currentFile.id,
            name: currentFile.fileName,
            type: currentFile.mimeType,
        } as any) as { exists: boolean; fetchUrl: string };

        if (checkResult.exists && checkResult.fetchUrl) {
            await filesDb.update(fileId, { cdnUrl: checkResult.fetchUrl });
            // Re-fetch state to continue Stage 3
            const recovered = await filesDb.get(fileId);
            if (!recovered) return;
            currentFile = recovered;
        } else {
            console.error(`[SyncOrchestrator] File ${fileId} data is permanently lost.`);
            await filesDb.update(fileId, { _syncError: 'FILE_DATA_LOST', isMainFileLost: true });
            // Continue to Stage 3 to sync metadata
            const lost = await filesDb.get(fileId);
            if (!lost) return;
            currentFile = lost;
        }
    }

    // 1. Original Upload Track (Only if mediaProxy is available)
    if (!currentFile.cdnUrl && mediaProxy) {
      tasks.push(this.triggerOriginalUpload(fileId, currentFile, mediaProxy));
    }

    // 2. Thumbnail Track (Only if mediaProxy is available)
    if (isMedia && !currentFile.thumbnailCdnUrl && mediaProxy) {
      tasks.push(this.manageThumbnailTrack(fileId, currentFile, mediaProxy));
    }

    // Wait for all initiated tasks to complete
    if (tasks.length > 0) {
      await Promise.all(tasks);
      // Refresh file state after parallel tasks
      const updated = await filesDb.get(fileId);
      if (!updated) return;
      currentFile = updated;
    }

    // 3. Final Sync Stage (Metadata to backend)
    // We only sync if original is uploaded AND (if media) thumbnail is uploaded
    // OR if the data is lost (in which case we sync what we have)
    const originalReady = !!currentFile.cdnUrl || currentFile.isMainFileLost;
    const thumbnailReady = !isMedia || !!currentFile.thumbnailCdnUrl || (currentFile.isMainFileLost && !currentFile._thumbnailBlob);

    if (originalReady && thumbnailReady && currentFile._pendingAction === 'create') {
        try {
            const { 
              _blob, _thumbnailBlob, _pendingAction, _lastSyncAttemptAt,
              createdAt, updatedAt, createdByUserId, 
              ...syncData 
            } = currentFile as any;

            const result = await orpcFetch.files.create(syncData);
            await this.handleSuccess('files', currentFile, result);
        } catch (err: any) {
            console.error(`[SyncOrchestrator] Metadata sync failed for ${fileId}`, err);
            throw err; // Trigger retry backoff
        }
    }
  }

  private async manageThumbnailTrack(fileId: string, file: StoredFile, mediaProxy: Remote<MediaWorkerAPI>) {
    let currentFile = file;

    // A. Generate if missing
    if (!currentFile._thumbnailBlob) {
      await this.triggerThumbnailGeneration(fileId, currentFile, mediaProxy);
      const updated = await filesDb.get(fileId);
      if (!updated) return;
      currentFile = updated;
    }

    // B. Upload if generated but no URL
    if (currentFile._thumbnailBlob && !currentFile.thumbnailCdnUrl) {
      await this.triggerThumbnailUpload(fileId, currentFile, mediaProxy);
    }
  }

  private async triggerThumbnailGeneration(fileId: string, file: StoredFile, mediaProxy: Remote<MediaWorkerAPI>) {
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
      console.error(`[SyncOrchestrator] Thumbnail generation fail for ${fileId}`, e);
      throw e;
    }
  }

  private async triggerOriginalUpload(fileId: string, file: StoredFile, mediaProxy: Remote<MediaWorkerAPI>) {
    try {
      if (!file._blob) return;
      const blobFile = Object.assign(
        new File([file._blob], file.fileName, { type: file.mimeType }),
        { id: fileId }
      );
      
      const result = await mediaProxy.media.uploadSingleFile(blobFile);
      if (result.success && result.cdnUrl) {
        await filesDb.update(fileId, { 
          cdnUrl: result.cdnUrl
        });
      }
    } catch (e: any) {
      console.error(`[SyncOrchestrator] Original upload fail for ${fileId}`, e);
      throw e;
    }
  }

  private async triggerThumbnailUpload(fileId: string, file: StoredFile, mediaProxy: Remote<MediaWorkerAPI>) {
    try {
      if (!file._thumbnailBlob) return;
      const thumbFile = Object.assign(
        new File([file._thumbnailBlob], "thumb", { type: file._thumbnailBlob.type }),
        { id: `${fileId}_thumb` }
      );

      const result = await mediaProxy.media.uploadSingleFile(thumbFile);
      if (result.success && result.cdnUrl) {
        await filesDb.update(fileId, { 
          thumbnailCdnUrl: result.cdnUrl
        });
      }
    } catch (e: any) {
      console.error(`[SyncOrchestrator] Thumbnail upload fail for ${fileId}`, e);
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
