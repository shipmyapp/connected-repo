import { subscribe } from "../db/db.manager";
import { filesDb } from "../db/files.db";
import { pendingSyncJournalEntriesDb } from "../db/pending-sync-journal-entries.db";
import { journalEntriesDb } from "../../modules/journal-entries/worker/journal-entries.db";
import { mediaUploadService } from "../cdn/media-upload.service";
import { orpcFetch } from "../../utils/orpc.client";
import type { PendingSyncJournalEntry } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { StoredFile } from "../db/schema.db.types";

export class SyncOrchestrator {
  private isProcessing = false;
  private interval: any = null;
  private inFlightSyncs = new Set<string>();

  constructor() {
    // Subscription-based trigger
    subscribe((table) => {
      if (table === "pendingSyncJournalEntries" || table === "files") {
        this.processQueue();
      }
    });

    // Start the periodic loop
    this.start();
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
  public async processQueue() {
    if (this.isProcessing) {
      console.debug("[SyncOrchestrator] ProcessQueue skipped: already processing.");
      return;
    }
    this.isProcessing = true;

    try {
      const entries = await pendingSyncJournalEntriesDb.getAll();
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
          console.group(`[Entry: ${entry.journalEntryId}] Status: ${entry.status}`);
          await this.orchestrateEntry(entry);
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

  private async orchestrateEntry(entry: PendingSyncJournalEntry) {
    const files = await filesDb.getFilesByPendingSyncId(entry.journalEntryId);
    console.debug(`[SyncOrchestrator] Found ${files.length} associated files for entry ${entry.journalEntryId}.`);
    
    let allMediaFinalized = true; // Finalized means either 'completed' or 'permanently failed'
    const attachmentUrls: ([string, string] | null)[] = [];

    // 1. Process attachments sequentially to maintain order and track status
    for (const fileId of entry.attachmentFileIds) {
      const file = files.find((f: StoredFile) => f.fileId === fileId);
      
      if (!file) {
        console.warn(`[SyncOrchestrator] Missing file record for ${fileId} in entry ${entry.journalEntryId}. Treating as null.`);
        attachmentUrls.push(null);
        continue;
      }

      // Phase A: Thumbnail Generation (if applicable)
      const needsThumbnail = file.mimeType.startsWith("image/");
      const thumbnailFailed = file.thumbnailStatus === 'failed' && (file.errorCount ?? 0) >= 3;
      const thumbnailReady = !needsThumbnail || file.thumbnailStatus === 'completed' || thumbnailFailed;

      if (!thumbnailReady) {
        allMediaFinalized = false;
        console.info(`[SyncOrchestrator] Thumbnail for ${fileId} not ready (Status: ${file.thumbnailStatus}).`);
        if (file.thumbnailStatus !== 'in-progress') {
          await mediaUploadService.generateAndStoreThumbnail(fileId);
        }
        attachmentUrls.push(null);
        continue;
      }

      // Phase B: CDN Upload
      const uploadFailed = file.status === 'failed' && (file.errorCount ?? 0) >= 5;
      const uploadReady = file.status === 'completed' || uploadFailed;

      if (!uploadReady) {
        allMediaFinalized = false;
        console.info(`[SyncOrchestrator] Media ${fileId} not ready (Status: ${file.status}).`);
        if (file.status !== 'in-progress') {
          await mediaUploadService.uploadMediaPair(fileId);
        }
        attachmentUrls.push(null);
        continue;
      }

      // If we reach here, the file is "ready" (either successfully uploaded or permanently failed)
      if (file.status === 'completed' && file.cdnUrls) {
        attachmentUrls.push(file.cdnUrls as [string, string]);
      } else {
        console.warn(`[SyncOrchestrator] File ${fileId} permanently failed or has no URLs. Sending null placeholder.`);
        attachmentUrls.push(null);
      }
    }

    console.debug(`[SyncOrchestrator] All media finalized: ${allMediaFinalized}. Attachments collected: ${attachmentUrls.filter(u => u !== null).length}/${entry.attachmentFileIds.length}`);

    // 2. Final Backend Sync
    if (allMediaFinalized) {
      const validAttachmentUrls = attachmentUrls.filter((u): u is [string, string] => u !== null);
      const hasFailures = validAttachmentUrls.length < entry.attachmentFileIds.length;

      if (hasFailures) {
        console.error(`[SyncOrchestrator] Entry ${entry.journalEntryId} has failed attachments. Aborting sync.`);
        await pendingSyncJournalEntriesDb.updateStatus(entry.journalEntryId, 'file-upload-failed', "One or more attachments failed to upload.");
      } else {
        await this.performBackendSync(entry, validAttachmentUrls);
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

  private async performBackendSync(entry: PendingSyncJournalEntry, attachmentUrls: [string, string][]) {
    // Avoid redundant calls while one is in flight in this session
    if (this.inFlightSyncs.has(entry.journalEntryId)) {
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
