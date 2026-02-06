import { type Store } from 'tinybase';
import { ulid } from 'ulid';
import type { ORPCClient } from '@frontend/utils/orpc.client';

/**
 * Media service for handling offline-first media capture and uploads.
 */
export class MediaService {
  private orpcClient: ORPCClient;

  constructor(
    private store: Store,
    orpcClient: ORPCClient
  ) {
    this.orpcClient = orpcClient;
  }

  /**
   * Compress an image to WebP using OffscreenCanvas
   */
  async compressToWebP(dataUrl: string, quality: number = 0.8): Promise<string> {
    try {
      // OffscreenCanvas is available in most modern workers
      if (typeof OffscreenCanvas === 'undefined') {
        console.warn('OffscreenCanvas not available, skipping compression');
        return dataUrl;
      }

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;

      // Draw and compress
      ctx.drawImage(bitmap, 0, 0);
      const compressedBlob = await canvas.convertToBlob({
        type: 'image/webp',
        quality: quality,
      });

      // Convert back to data URL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(compressedBlob);
      });
    } catch (error) {
      console.error('WebP compression failed:', error);
      return dataUrl; // Fallback to original
    }
  }

  /**
   * Queue a media item for upload.
   * Links it to a lead and stores it locally until synced.
   */
  async queueUpload(
    localUrl: string, // This should be a Data URL or Blob URL
    fileType: string,
    fileName: string,
    leadId: string,
    field: 'visitingCardFrontUrl' | 'visitingCardBackUrl' | 'voiceNoteUrl'
  ): Promise<string> {
    const uploadId = ulid();
    const type = fileType.startsWith('image/') ? 'image' : 'voice';

    console.log('[MediaService] Queueing upload:', {
      uploadId,
      leadId,
      field,
      type,
      fileType,
      isOnline: navigator.onLine,
    });

    this.store.setRow('uploads', uploadId, {
      id: uploadId,
      leadId,
      localUrl,
      type,
      fileType,
      field,
      status: 'pending',
      createdAt: Date.now(),
    });

    console.log('[MediaService] Upload queued successfully:', uploadId);

    // Attempt processing if online
    if (navigator.onLine) {
      console.log('[MediaService] Device is online, triggering processUpload...');
      this.processUpload(uploadId).catch((error) => {
        console.error('[MediaService] processUpload failed:', error);
      });
    } else {
      console.log('[MediaService] Device is offline, upload will be processed when online');
    }

    return uploadId;
  }

  /**
   * Process a single upload item.
   */
  async processUpload(uploadId: string): Promise<void> {
    const upload = this.store.getRow('uploads', uploadId);
    if (!upload || upload.status === 'done' || upload.status === 'uploading') return;

    try {
      console.log('[MediaService] Starting upload process for:', uploadId);
      this.store.setCell('uploads', uploadId, 'status', 'uploading');

      // Convert local Data URL to Blob
      console.log('[MediaService] Converting local URL to blob...');
      const response = await fetch(upload.localUrl as string);
      const blob = await response.blob();

      // Get presigned URL from backend
      const fileName = `${upload.field}-${uploadId}`;
      console.log('[MediaService] Requesting presigned URL from backend:', {
        fileName,
        fileType: upload.fileType,
        leadId: upload.leadId,
        field: upload.field,
      });
      
      const presignedResult = await this.orpcClient.media.getUploadUrl({
        fileName,
        fileType: upload.fileType as string,
        leadId: upload.leadId as string,
        field: upload.field as 'visitingCardFrontUrl' | 'visitingCardBackUrl' | 'voiceNoteUrl',
      });

      console.log('[MediaService] Received presigned URL:', {
        uploadUrl: presignedResult.uploadUrl,
        publicUrl: presignedResult.publicUrl,
        key: presignedResult.key,
      });

      // Upload directly to S3 using presigned URL
      console.log('[MediaService] Uploading to S3...');
      const uploadResponse = await fetch(presignedResult.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': upload.fileType as string,
        },
      });

      if (!uploadResponse.ok) {
        console.error('[MediaService] S3 upload failed:', {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
        });
        throw new Error(`S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      console.log('[MediaService] S3 upload successful!');

      // Update upload status with public URL
      this.store.setRow('uploads', uploadId, {
        ...upload,
        status: 'done',
        remoteUrl: presignedResult.publicUrl,
        _isNull_remoteUrl: false,
      });

      // Link to lead in the main leads table
      const leadId = upload.leadId as string;
      const field = upload.field as string;

      console.log('[MediaService] Linking media to lead:', { leadId, field, publicUrl: presignedResult.publicUrl });

      if (this.store.hasRow('leads', leadId)) {
        this.store.setCell('leads', leadId, field, presignedResult.publicUrl);
        this.store.setCell('leads', leadId, `_isNull_${field}`, false);
        this.store.setCell('leads', leadId, '_isPending', true);
        console.log('[MediaService] Successfully linked media to lead in TinyBase');
      } else {
        console.warn('[MediaService] Lead not found in TinyBase:', leadId);
      }

      // ALSO link to the lead in pending_entries if it exists
      const pendingIds = this.store.getRowIds('pending_entries');
      for (const pId of pendingIds) {
        const pending = this.store.getRow('pending_entries', pId);
        if (pending.entity === 'leads') {
          const payload = JSON.parse(pending.payload as string);
          if (payload.leadId === leadId) {
            payload[field] = presignedResult.publicUrl;
            this.store.setCell('pending_entries', pId, 'payload', JSON.stringify(payload));
            break;
          }
        }
      }

      // Cleanup local storage if everything is synced
      // Actually, we keep it in 'uploads' until the lead itself is synced to server?
      // For now, let's keep it for UI feedback.
    } catch (error) {
      console.error('[MediaService] Upload failed for:', uploadId);
      console.error('[MediaService] Error details:', error);
      this.store.setRow('uploads', uploadId, {
        ...upload,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    console.log('[MediaService] Upload process completed for:', uploadId);
  }

  /**
   * Process all pending uploads.
   */
  async processPendingUploads(): Promise<void> {
    const uploadIds = this.store.getRowIds('uploads');
    for (const id of uploadIds) {
      const upload = this.store.getRow('uploads', id);
      if (upload.status === 'pending' || upload.status === 'error') {
        await this.processUpload(id);
      }
    }
  }

  /**
   * Get uploads for a specific lead.
   */
  getUploadsByLead(leadId: string) {
    const allIds = this.store.getRowIds('uploads');
    return allIds
      .map(id => this.store.getRow('uploads', id))
      .filter(row => row.leadId === leadId);
  }
}
