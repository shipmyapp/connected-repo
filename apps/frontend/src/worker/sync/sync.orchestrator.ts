import { subscribe, type AppDbTable } from "../db/db.manager";
import { filesDb } from "../db/files.db";
import { pendingSyncJournalEntriesDb } from "../db/pending-sync-journal-entries.db";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { getMediaProxyInternal } from "../worker.context";
import { orpcFetch } from "../../utils/orpc.client";
import type { PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { StoredFile } from "../db/schema.db.types";

export class SyncOrchestrator {
  private isProcessing = false;
  private interval: any = null;
  private inFlightSyncs = new Set<string>();

  constructor() {
    // Subscription-based trigger
    subscribe((table: AppDbTable) => {
      if (table === "pendingSyncJournalEntries" || table === "files") {
        this.processQueue();
      }
    });
  }

  public getProcessingStatus() {
    return this.isProcessing;
  }

  private isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
  }

  public start() {
    if (this.interval) return;
    console.info("[SyncOrchestrator] Started background sync loop");
    
    // Periodic check every 60 seconds as a fallback safety
    this.interval = setInterval(() => this.processQueue(), 60000);
    this.processQueue();
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.info("[SyncOrchestrator] Stopped background sync loop");
  }

  /**
   * Main orchestration loop.
   */
  public async processQueue(force: boolean = false) {
    if (this.isProcessing) {
      console.debug("[SyncOrchestrator] ProcessQueue skipped: already processing.");
      return;
    }

    if (!this.isOnline() && !force) {
      console.debug("[SyncOrchestrator] ProcessQueue skipped: offline.");
      return;
    }

    this.isProcessing = true;

    try {
      const entries = await pendingSyncJournalEntriesDb.getAllUnscoped();
      if (entries.length === 0) {
        console.debug("[SyncOrchestrator] ProcessQueue: No pending entries found.");
        return;
      }

      console.group(`[SyncOrchestrator] Processing ${entries.length} pending entries`);

      for (const entry of entries) {
        // Skip if already synced but somehow still in pending
        if (entry.status === 'synced') {
          console.debug(`[SyncOrchestrator] Entry ${entry.journalEntryId} already synced, skipping.`);
          continue;
        }
        
        try {
          console.group(`[Entry: ${entry.journalEntryId}] Status: ${entry.status} (Force: ${force})`);
          await this.orchestrateEntry(entry, force);
          console.groupEnd();
        } catch (err) {
          console.error(`[SyncOrchestrator] Error orchestrating entry ${entry.journalEntryId}:`, err);
          console.groupEnd();
        }
      }
      console.groupEnd();
    } catch (err) {
        console.error("[SyncOrchestrator] Queue processing failed:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Helper to handle errors during the orchestration of a single file
   */
  private async handleFileError(fileId: string, error: unknown, type: 'thumbnail' | 'upload') {
    const file = await filesDb.get(fileId);
    if (!file) return;

    const newErrorCount = (file.errorCount ?? 0) + 1;
    const errorMsg = error instanceof Error ? error.message : String(error);

    const update: Partial<StoredFile> = {
      error: errorMsg,
      errorCount: newErrorCount,
    };

    if (type === 'thumbnail') {
      update.thumbnailStatus = 'failed';
    } else {
      update.status = 'failed';
    }

    await filesDb.update(fileId, update);
    console.warn(`[SyncOrchestrator] ${type} failed for ${fileId} (Count: ${newErrorCount}):`, errorMsg);
  }

  private async orchestrateEntry(entry: PendingSyncJournalEntry, force: boolean) {
    const files = await filesDb.getFilesByPendingSyncId(entry.journalEntryId);
    const mediaProxy = getMediaProxyInternal();
    
    if (!mediaProxy) {
      console.warn("[SyncOrchestrator] MediaProxy not yet bridged, skipping media tasks for this tick.");
      return;
    }

    let allMediaFinalized = true; // Finalized means either 'completed' or 'permanently failed'
    const attachmentUrls: ([string, "not-available" | string] | null)[] = [];

    // 1. Process attachments sequentially to maintain order and track status
    for (const fileId of entry.attachmentFileIds) {
      const file = files.find((f: StoredFile) => f.fileId === fileId);
      
      if (!file) {
        console.warn(`[SyncOrchestrator] Missing file record for ${fileId} in entry ${entry.journalEntryId}. Treating as null.`);
        attachmentUrls.push(null);
        continue;
      }

      // Phase A: Thumbnail Generation (if applicable)
      const needsThumbnail = file.mimeType.startsWith("image/") || file.mimeType === "application/pdf" || file.mimeType.startsWith("video/");
      const thumbnailPermanentlyFailed = !force && (file.errorCount ?? 0) >= 3;
      const thumbnailReady = !needsThumbnail || file.thumbnailStatus === 'completed';

      if (!thumbnailReady) {
        allMediaFinalized = false;
        console.info(`[SyncOrchestrator] Thumbnail for ${fileId} not ready (Status: ${file.thumbnailStatus}, Force: ${force}).`);
        
        if (file.thumbnailStatus !== 'in-progress' || force || thumbnailPermanentlyFailed) {
          try {
            if (thumbnailPermanentlyFailed) {
              console.warn(`[SyncOrchestrator] Thumbnail generation failed repeatedly for ${fileId}. Marking as completed (will use "not-available" fallback).`);
              await filesDb.update(fileId, { thumbnailStatus: 'completed' });
            } else {
              await filesDb.update(fileId, { thumbnailStatus: 'in-progress' });
              const originalFile = new File([file.blob], file.fileName, { type: file.mimeType });
              const result = await mediaProxy.media.generateThumbnail(originalFile);
              
              if (result.thumbnailFile) {
                await filesDb.update(fileId, {
                  thumbnailBlob: result.thumbnailFile,
                  thumbnailStatus: 'completed'
                });
                console.debug(`[SyncOrchestrator] Generated thumbnail for ${fileId}`);
              } else if (result.error) {
                throw new Error(result.error);
              } else {
                // No thumbnail needed or generic failure
                await filesDb.update(fileId, { thumbnailStatus: 'completed' });
              }
            }
          } catch (error) {
            await this.handleFileError(fileId, error, 'thumbnail');
          }
        }
        attachmentUrls.push(null);
        continue;
      }

      // Phase B: CDN Upload
      const uploadFailed = !force && file.status === 'failed' && (file.errorCount ?? 0) >= 5;
      const uploadReady = file.status === 'completed' || uploadFailed;

      if (!uploadReady) {
        allMediaFinalized = false;
        console.info(`[SyncOrchestrator] Media ${fileId} not ready (Status: ${file.status}, Force: ${force}).`);
        
        if (file.status !== 'in-progress' || force) {
          try {
            await filesDb.update(fileId, { status: 'in-progress' });
            const originalFile = new File([file.blob], file.fileName, { type: file.mimeType });
            let thumbnailFile: File | undefined = undefined;
            
            if (file.thumbnailBlob) {
              thumbnailFile = new File([file.thumbnailBlob], `thumb_${file.fileName}`, { type: file.thumbnailBlob.type });
            }

            const result = await mediaProxy.media.uploadMediaPair(originalFile, thumbnailFile);
            
            if (result.success && result.urls) {
              await filesDb.update(fileId, {
                cdnUrls: result.urls,
                status: 'completed'
              });
              console.debug(`[SyncOrchestrator] Uploaded media for ${fileId}`);
            } else {
              throw new Error(result.error || "Upload failed");
            }
          } catch (error) {
            await this.handleFileError(fileId, error, 'upload');
          }
        }
        attachmentUrls.push(null);
        continue;
      }

      // If we reach here, the file is "ready" (either successfully uploaded or permanently failed)
      if (file.status === 'completed' && file.cdnUrls) {
        attachmentUrls.push(file.cdnUrls as [string, "not-available" | string]);
      } else {
        console.warn(`[SyncOrchestrator] File ${fileId} permanently failed or has no URLs. Sending null placeholder.`);
        attachmentUrls.push(null);
      }
    }

    console.debug(`[SyncOrchestrator] All media finalized: ${allMediaFinalized}. Attachments collected: ${attachmentUrls.filter(u => u !== null).length}/${entry.attachmentFileIds.length}`);

    // 2. Final Backend Sync
    if (allMediaFinalized) {
      const validAttachmentUrls = attachmentUrls.filter((u): u is [string, "not-available" | string] => u !== null);
      const hasFailures = validAttachmentUrls.length < entry.attachmentFileIds.length;

      if (hasFailures) {
        console.error(`[SyncOrchestrator] Entry ${entry.journalEntryId} has failed attachments. Aborting sync.`);
        await pendingSyncJournalEntriesDb.updateStatus(entry.journalEntryId, 'file-upload-failed', "One or more attachments failed to upload.");
      } else {
        await this.performBackendSync(entry, validAttachmentUrls, force);
      }
    } else {
      // Update entry status if it's not already in an informative state
      const currentStatus = attachmentUrls.every(u => u === null) 
        ? entry.status // Don't change if we haven't even started or if all failed early
        : 'file-upload-in-progress';
        
      if (entry.status !== currentStatus && !['file-upload-failed', 'sync-failed', 'syncing'].includes(entry.status)) {
        console.info(`[SyncOrchestrator] Transitioning entry status: ${entry.status} -> ${currentStatus}`);
        await pendingSyncJournalEntriesDb.updateStatus(entry.journalEntryId, currentStatus);
      }
    }
  }

  private async performBackendSync(entry: PendingSyncJournalEntry, attachmentUrls: [string, "not-available" | string][], force: boolean) {
    // Avoid redundant calls while one is in flight in this session
    if (!force && this.inFlightSyncs.has(entry.journalEntryId)) {
        console.debug(`[SyncOrchestrator] Backend sync already in flight for ${entry.journalEntryId}, skipping.`);
        return;
    }

    try {
      this.inFlightSyncs.add(entry.journalEntryId);
      console.info(`[SyncOrchestrator] Starting backend sync for ${entry.journalEntryId}...`);
      await pendingSyncJournalEntriesDb.updateStatus(entry.journalEntryId, 'syncing');

      const payload = {
        journalEntryId: entry.journalEntryId,
        content: entry.content,
        prompt: entry.prompt,
        promptId: entry.promptId,
        attachmentUrls: attachmentUrls,
        createdAt: entry.createdAt,
        teamId: entry.teamId,
      };

      console.group("[SyncOrchestrator] oRPC Payload");
      console.dir(payload);
      console.groupEnd();

      // @ts-ignore - ORPC types can be strict with date/number conversion sometimes
      const result = await orpcFetch.journalEntries.create(payload);
      
      console.info(`[SyncOrchestrator] Backend confirmed creation. Result ID: ${result.journalEntryId}`);
      
      // Success! Move to main table.
      // journalEntriesDb.upsert handles removing from pendingSyncJournalEntriesDb via transaction
      await journalEntriesDb.upsert(result);
      console.info(`[SyncOrchestrator] Successfully moved ${entry.journalEntryId} from pending to main.`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[SyncOrchestrator] Failed backend sync for ${entry.journalEntryId}:`, err);
      
      // Recoverable error: update status and wait for next tick/retry
      await pendingSyncJournalEntriesDb.updateStatus(entry.journalEntryId, 'sync-failed', errorMsg);
    } finally {
      this.inFlightSyncs.delete(entry.journalEntryId);
    }
  }
}

export const syncOrchestrator = new SyncOrchestrator();
