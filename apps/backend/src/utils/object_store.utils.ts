import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { env } from "@backend/configs/env.config";
import { s3Client } from "@backend/utils/s3.client";

const BATCH = 1000; // DeleteObjects' maximum per request

/**
 * Deletes objects from the bucket, 1 000 per request. A key that does not
 * exist counts as deleted (S3 semantics). Never throws: each key comes back
 * in `deleted` or in `failed` with the bucket's message.
 */
export async function deleteObjects(keys: readonly string[]): Promise<{
	deleted: string[];
	failed: { key: string; message: string }[];
}> {
	const deleted: string[] = [];
	const failed: { key: string; message: string }[] = [];
	for (let i = 0; i < keys.length; i += BATCH) {
		const batch = keys.slice(i, i + BATCH);
		try {
			const out = await s3Client.send(
				new DeleteObjectsCommand({
					Bucket: env.S3_BUCKET_NAME,
					Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
				}),
			);
			const errors = new Map(
				(out.Errors ?? []).map((e) => [e.Key ?? "", e.Message ?? e.Code ?? "error"]),
			);
			for (const key of batch) {
				const message = errors.get(key);
				if (message === undefined) deleted.push(key);
				else failed.push({ key, message });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			for (const key of batch) failed.push({ key, message });
		}
	}
	return { deleted, failed };
}
