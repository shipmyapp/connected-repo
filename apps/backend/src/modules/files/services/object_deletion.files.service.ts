import { db } from "@backend/db/db";
import { objectKeyFromPublicUrl } from "@backend/utils/cdn.utils";
import { logger } from "@backend/utils/logger.utils";
import { deleteObjects } from "@backend/utils/object_store.utils";

/** Object keys of file rows (main and thumbnail), deduplicated, foreign URLs skipped. */
export const objectKeysOfFiles = (
	rows: readonly { cdnUrl: string | null; thumbnailCdnUrl: string | null }[],
): string[] => {
	const keys = new Set<string>();
	for (const row of rows) {
		for (const url of [row.cdnUrl, row.thumbnailCdnUrl]) {
			const key = url ? objectKeyFromPublicUrl(url) : null;
			if (key) keys.add(key);
		}
	}
	return [...keys];
};

/** Queues keys for deletion; call inside the transaction that deletes their rows. */
export async function queueObjectDeletions(keys: readonly string[]): Promise<void> {
	if (keys.length === 0) return;
	await db.storageObjectDeletions
		.createMany(keys.map((objectKey) => ({ objectKey })))
		.onConflictDoNothing();
}

/**
 * Deletes up to `limit` queued objects from the bucket; a deleted key leaves
 * the queue, a failed one stays with its attempt count and error. Run after
 * the queueing transaction has committed, and on every purge tick.
 */
export async function drainObjectDeletions(
	limit = 1000,
): Promise<{ deleted: number; failed: number }> {
	const keys = await db.storageObjectDeletions
		.order({ createdAt: "ASC" })
		.limit(limit)
		.pluck("objectKey");
	if (keys.length === 0) return { deleted: 0, failed: 0 };
	const { deleted, failed } = await deleteObjects(keys);
	if (deleted.length > 0) {
		await db.storageObjectDeletions.where({ objectKey: { in: deleted } }).delete();
	}
	for (const { key, message } of failed) {
		await db.storageObjectDeletions.where({ objectKey: key }).increment("attempts");
		await db.storageObjectDeletions
			.where({ objectKey: key })
			.update({ lastError: message.slice(0, 500) });
	}
	if (failed.length > 0) {
		logger.warn({ failed: failed.length }, "Bucket deletions failed; kept for the next tick");
	}
	return { deleted: deleted.length, failed: failed.length };
}
