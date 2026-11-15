import { BaseTable } from "@backend/db/base_table";

/**
 * Bucket objects waiting to be deleted. Written in the same transaction that
 * deletes the rows pointing at them (the account purge), drained after commit
 * by `drainObjectDeletions`, retried on every purge tick until the bucket
 * confirms. Not synced.
 */
export class StorageObjectDeletionTable extends BaseTable {
	readonly table = "storage_object_deletions";

	columns = this.setColumns((t) => ({
		objectKey: t.text().primaryKey(),
		attempts: t.integer().default(0),
		lastError: t.text().nullable(),
		...t.timestampsAsNumbers(),
	}));
}
