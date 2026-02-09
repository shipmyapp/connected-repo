import { S3Client } from "@aws-sdk/client-s3";
import { env } from "../configs/env.config";

/**
 * Shared S3 client instance for S3-compatible storage (Cloudflare R2, DigitalOcean Spaces, etc.)
 * Configured with credentials and endpoint from the backend environment.
 */
export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  // forcePathStyle is often required for some S3-compatible providers
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});
