import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@backend/configs/env.config';

export interface PresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

export class S3Service {
  private client: S3Client;
  private bucket: string;
  private region: string;
  private cdnUrl?: string;

  constructor(config: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    cdnUrl?: string;
  }) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false, // DigitalOcean Spaces uses virtual-hosted-style URLs
    });

    this.bucket = config.bucket;
    this.region = config.region;
    this.cdnUrl = config.cdnUrl;
  }

  /**
   * Generate a presigned URL for uploading a file
   */
  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 300 // 5 minutes default
  ): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read', // Make files publicly accessible
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });

    // Generate public URL
    const publicUrl = this.cdnUrl
      ? `${this.cdnUrl}/${key}`
      : `https://${this.bucket}.${this.region}.digitaloceanspaces.com/${key}`;

    return {
      uploadUrl,
      publicUrl,
      key,
    };
  }

  /**
   * Generate a public URL for a given key (without presigning)
   */
  getPublicUrl(key: string): string {
    return this.cdnUrl
      ? `${this.cdnUrl}/${key}`
      : `https://${this.bucket}.${this.region}.digitaloceanspaces.com/${key}`;
  }
}

// Singleton instance
let s3ServiceInstance: S3Service | null = null;

export function getS3Service(): S3Service {
  if (!s3ServiceInstance) {
    const endpoint = env.DO_ORIGIN_ENDPOINT;
    const accessKeyId = env.DO_ACCESS_KEY_ID;
    const secretAccessKey = env.DO_ACCESS_KEY_SECRET;

    s3ServiceInstance = new S3Service({
      endpoint,
      region: "blr1",
      bucket: "expowiz",
      accessKeyId,
      secretAccessKey,
      cdnUrl: "https://expowiz.blr1.cdn.digitaloceanspaces.com", // Optional CDN URL
    });
  }

  return s3ServiceInstance;
}
