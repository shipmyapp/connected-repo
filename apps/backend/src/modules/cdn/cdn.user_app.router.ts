import { rpcProtectedProcedure } from '@backend/procedures/protected.procedure';
import { z } from 'zod';
import { generatePresignedUrlService, generateUrlInput } from './services/generate_presigned_url.cdn.services';
import { checkFileExistsInCdnService } from './services/check_file_exists.cdn.services';

const generateUrlOutput = z.object({
  signedUrl: z.string(),
  key: z.string(),
  fetchUrl: z.string(),
});

/**
 * Generates a presigned URL for uploading a file to S3.
 */
export const generatePresignedUrl = rpcProtectedProcedure
  .route({ method: "GET", tags: ["CDN"] })
  .input(generateUrlInput)
  .output(generateUrlOutput)
  .handler(async ({ input, context: { user: { id: userId } } }) => {
    return await generatePresignedUrlService(input, userId);
  });

/**
 * Generates multiple presigned URLs for batch uploads.
 */
export const generateBatchPresignedUrls = rpcProtectedProcedure
  .route({ method: "POST", tags: ["CDN"] })
  .input(z.array(generateUrlInput).max(100))
  .output(z.array(generateUrlOutput))
  .handler(async ({ input, context: { user: { id: userId } } }) => {
    return await Promise.all(
      input.map((file) => generatePresignedUrlService(file, userId))
    );
  });

/**
 * Checks if a file exists in S3.
 */
export const checkFileExistsInCdn = rpcProtectedProcedure
  .route({ method: "GET", tags: ["CDN"] })
  .input(generateUrlInput)
  .output(z.object({ exists: z.boolean(), key: z.string(), fetchUrl: z.string() }))
  .handler(async ({ input, context: { user: { id: userId } } }) => {
    return await checkFileExistsInCdnService(input, userId);
  });

export const cdnRouter = {
  generatePresignedUrl,
  generateBatchPresignedUrls,
  checkFileExistsInCdn,
};
