import { rpcProtectedActiveTeamProcedure } from "@backend/procedures/protected.procedure";
import { z } from "zod";
import { checkFileExistsInCdnService } from "./services/check_file_exists.cdn.services";
import {
	cdnFileLocatorInput,
	generatePresignedUrlService,
	generateUrlInput,
} from "./services/generate_presigned_url.cdn.services";

const generateUrlOutput = z.object({
	signedUrl: z.string(),
	key: z.string(),
	fetchUrl: z.string(),
});

/**
 * Generates a presigned URL for uploading a file to S3.
 */
export const generatePresignedUrl = rpcProtectedActiveTeamProcedure
	.route({ method: "GET", tags: ["CDN"] })
	.input(generateUrlInput)
	.output(generateUrlOutput)
	.handler(
		async ({
			input,
			context: {
				user: { id: userId },
				activeTeamId,
			},
		}) => {
			return await generatePresignedUrlService(input, userId, activeTeamId);
		},
	);

/**
 * Generates multiple presigned URLs for batch uploads.
 */
export const generateBatchPresignedUrls = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["CDN"] })
	.input(z.array(generateUrlInput).max(100))
	.output(z.array(generateUrlOutput))
	.handler(
		async ({
			input,
			context: {
				user: { id: userId },
				activeTeamId,
			},
		}) => {
			return await Promise.all(
				input.map((file) => generatePresignedUrlService(file, userId, activeTeamId)),
			);
		},
	);

/**
 * Checks if a file exists in S3.
 */
export const checkFileExistsInCdn = rpcProtectedActiveTeamProcedure
	.route({ method: "GET", tags: ["CDN"] })
	.input(cdnFileLocatorInput)
	.output(z.object({ exists: z.boolean(), key: z.string(), fetchUrl: z.string() }))
	.handler(
		async ({
			input,
			context: {
				user: { id: userId },
				activeTeamId,
			},
		}) => {
			return await checkFileExistsInCdnService(input, userId, activeTeamId);
		},
	);

export const cdnRouter = {
	generatePresignedUrl,
	generateBatchPresignedUrls,
	checkFileExistsInCdn,
};
