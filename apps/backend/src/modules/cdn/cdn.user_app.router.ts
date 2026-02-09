import { rpcProtectedProcedure } from '@backend/procedures/protected.procedure';
import { z } from 'zod';
import { generatePresignedUrlService, generateUrlInput } from './services/generate_presigned_url.cdn.services';

const generateUrlOutput = z.object({
  signedUrl: z.string(),
  key: z.string(),
  fetchUrl: z.string(),
});

/**
 * Generates a presigned URL for uploading a file to S3.
 */
export const generatePresignedUrl = rpcProtectedProcedure
  .input(generateUrlInput)
  .output(generateUrlOutput)
  .handler(async ({ input, context: { user: { id: userId } } }) => {
    return await generatePresignedUrlService(input, userId);
  });

/**
 * Generates multiple presigned URLs for batch uploads.
 */
export const generateBatchPresignedUrls = rpcProtectedProcedure
  .input(z.array(generateUrlInput).max(10))
  .output(z.array(generateUrlOutput))
  .handler(async ({ input, context: { user: { id: userId } } }) => {
    return await Promise.all(
      input.map((file) => generatePresignedUrlService(file, userId))
    );
  });

export const cdnRouter = {
  generatePresignedUrl,
  generateBatchPresignedUrls,
};
