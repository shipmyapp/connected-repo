import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@backend/configs/env.config";
import { generatePublicUrl, generateS3Key } from "@backend/utils/cdn.utils";
import { s3Client } from "@backend/utils/s3.client";
import type { z } from "zod";
import type { generateUrlInput } from "./generate_presigned_url.cdn.services";

export const checkFileExistsInCdnService = async (
	input: z.infer<typeof generateUrlInput>,
	userId: string,
) => {
	const key = generateS3Key({
		folderName: input.teamHandle ?? userId,
		fileName: input.fileName,
		resourceType: input.resourceType,
		id: input.id,
	});

	try {
		await s3Client.send(
			new HeadObjectCommand({
				Bucket: env.S3_BUCKET_NAME,
				Key: key,
			}),
		);
		return { exists: true, key, fetchUrl: generatePublicUrl(key) };
	} catch (error: any) {
		if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
			return { exists: false, key, fetchUrl: "" };
		}
		throw error;
	}
};
