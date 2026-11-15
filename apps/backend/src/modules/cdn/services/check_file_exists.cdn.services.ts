import { HeadObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { env } from "@backend/configs/env.config";
import { generatePublicUrl, generateS3Key } from "@backend/utils/cdn.utils";
import { s3Client } from "@backend/utils/s3.client";
import type { z } from "zod";
import type { cdnFileLocatorInput } from "./generate_presigned_url.cdn.services";

export const checkFileExistsInCdnService = async (
	input: z.infer<typeof cdnFileLocatorInput>,
	_userId: string,
	activeTeamId: string,
) => {
	const key = generateS3Key({
		folderName: activeTeamId,
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
	} catch (error) {
		if (
			error instanceof S3ServiceException &&
			(error.name === "NotFound" || error.$metadata?.httpStatusCode === 404)
		) {
			return { exists: false, key, fetchUrl: "" };
		}
		throw error;
	}
};
