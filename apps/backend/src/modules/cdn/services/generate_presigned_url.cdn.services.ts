import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@backend/configs/env.config";
import { generatePublicUrl, generateS3Key } from "@backend/utils/cdn.utils";
import { s3Client } from "@backend/utils/s3.client";
import { z } from "zod";

export const generateUrlInput = z.object({
  contentType: z.string().optional(),
  fileName: z.string().min(1),
  resourceType: z.string().default('media'),
  teamHandle: z.string().optional(),
});

export const generatePresignedUrlService = async (input: z.infer<typeof generateUrlInput>, userId: string) => {
    // Generate S3 key - you can use context.user.id for user isolation if needed
    const key = generateS3Key({
      folderName: input.teamHandle ?? userId,
      fileName: input.fileName,
      resourceType: input.resourceType,
    });

    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      ContentType: input.contentType,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return {
      signedUrl,
      key,
      fetchUrl: generatePublicUrl(key),
    };
};