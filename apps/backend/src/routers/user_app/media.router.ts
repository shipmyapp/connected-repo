import { z } from 'zod';
import { getS3Service } from '../../services/s3.service.js';
import { ulid } from 'ulid';
import { rpcPublicProcedure } from '@backend/procedures/public.procedure.js';

/**
 * Media router for handling file uploads via presigned URLs
 */

const getUploadUrlInputZod = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100), // MIME type
  leadId: z.string().ulid(),
  field: z.enum(['visitingCardFrontUrl', 'visitingCardBackUrl', 'voiceNoteUrl']),
});

const getUploadUrlOutputZod = z.object({
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
  key: z.string(),
});

export const mediaRouter = {
  /**
   * Generate a presigned URL for uploading media
   */
  getUploadUrl: rpcPublicProcedure
    .input(getUploadUrlInputZod)
    .output(getUploadUrlOutputZod)
    .handler(async ({ input, context }) => {
      const { fileName, fileType, leadId, field } = input;

      console.log('[MediaRouter] Received presigned URL request:', {
        fileName,
        fileType,
        leadId,
        field,
      });

      // Generate a unique key for the file
      const uploadId = ulid();
      const extension = fileName.split('.').pop() || '';
      const sanitizedFileName = fileName.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
      
      // Organize files by lead ID for better structure
      const key = `leads/${leadId}/${field}/${uploadId}-${sanitizedFileName}`;

      console.log('[MediaRouter] Generated S3 key:', key);

      const s3Service = getS3Service();
      const result = await s3Service.generatePresignedUploadUrl(key, fileType);

      console.log('[MediaRouter] Generated presigned URL:', {
        uploadUrl: result.uploadUrl.substring(0, 100) + '...',
        publicUrl: result.publicUrl,
        key: result.key,
      });

      return result;
    }),
};
