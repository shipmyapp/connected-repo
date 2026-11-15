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
	// By default the SDK (>= 3.729) signs a CRC32 of the request body into
	// every presigned PUT. At signing time that body is empty, so the
	// browser's real upload fails the checksum (R2, MinIO, S3). Checksums only
	// where an operation requires one.
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED",
	credentials: {
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
	},
});
