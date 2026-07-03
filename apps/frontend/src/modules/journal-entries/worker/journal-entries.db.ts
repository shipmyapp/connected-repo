import type { FileSelectAll } from "@connected-repo/zod-schemas/file.zod";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type { JournalEntrySelectAllWithRelations } from "@connected-repo/zod-schemas/journal-entries/sync";
import { getClientDb } from "../../../worker/db/db.lifecycle";
import {
	notifySubscribers,
	type Pending,
	type StoredJournalEntry,
} from "../../../worker/db/db.manager";

/**
 * Local mirror of `journal_entries` plus its nested `files` relation.
 * Pending vs confirmed distinction lives on the row: `createdAt === null`
 * means the row exists only locally.
 */
export const journalEntriesDb = {
	async getAll(teamId: string): Promise<StoredJournalEntry[]> {
		return await getClientDb().journalEntries
			.where("[teamId+updatedAt]")
			.between([teamId, Dexie.minKey], [teamId, Dexie.maxKey])
			.reverse()
			.toArray();
	},

	async getPending(teamId: string): Promise<StoredJournalEntry[]> {
		// Dexie can't index nulls directly; scan the team's rows.
		return await getClientDb().journalEntries
			.where({ teamId })
			.filter((r) => r.createdAt == null)
			.toArray();
	},

	async getById(id: string): Promise<StoredJournalEntry | undefined> {
		return await getClientDb().journalEntries.get(id);
	},

	/**
	 * Local optimistic write. Accepts a `Pending<>` shape so callers can
	 * pass `createdAt: null` directly — the pending marker used across
	 * the sync engine. `syncError` is cleared. The row's `updatedAt` is
	 * caller-provided (never null — it's a Dexie compound-index key);
	 * callers should pass a current-time μs string so the row sorts at
	 * approximately the right position until the server echoes back
	 * with the canonical value via `overwriteFromServer`.
	 */
	async upsertPendingLocal(
		row: Pending<JournalEntrySelectAll>,
	): Promise<StoredJournalEntry> {
		const pending: StoredJournalEntry = {
			...row,
			createdAt: null,
			syncError: null,
		};
		await getClientDb().journalEntries.put(pending);
		notifySubscribers("journalEntries");
		return pending;
	},

	/**
	 * Server-authoritative overwrite. Also merges the nested `files`
	 * rows into the local `files` table if present (used by the online
	 * `create` handler's echo and by `pushCreates` results).
	 */
	async overwriteFromServer(row: JournalEntrySelectAllWithRelations): Promise<void> {
		const { files, ...parent } = row;
		const stored: StoredJournalEntry = {
			...(parent as JournalEntrySelectAll),
			syncError: null,
		};
		await getClientDb().journalEntries.put(stored);

		if (files?.length) {
			await mergeFilesFromServer(files);
			notifySubscribers("files", "sync");
		}
		notifySubscribers("journalEntries", "sync");
	},

	async bulkUpsertFromServer(rows: JournalEntrySelectAll[]): Promise<void> {
		if (rows.length === 0) return;
		const stored: StoredJournalEntry[] = rows.map((r) => ({
			...r,
			syncError: null,
		}));
		await getClientDb().journalEntries.bulkPut(stored);
		notifySubscribers("journalEntries", "sync");
	},

	/** Count rows waiting to be pushed to the server (createdAt is null). */
	async countPending(teamId: string): Promise<number> {
		return await getClientDb()
			.journalEntries.where({ teamId })
			.filter((r) => r.createdAt == null)
			.count();
	},

	/** Count rows carrying a sync error. */
	async countErrors(teamId: string): Promise<number> {
		return await getClientDb()
			.journalEntries.where({ teamId })
			.filter((r) => Boolean(r.syncError))
			.count();
	},

	/** Full rows for the error drill-in on the sync-status page. */
	async listErrored(teamId: string): Promise<StoredJournalEntry[]> {
		return await getClientDb()
			.journalEntries.where({ teamId })
			.filter((r) => Boolean(r.syncError))
			.toArray();
	},

	/**
	 * Clear syncError so the next sync cycle retries the row. For a
	 * pending row (createdAt=null) this puts it back in the pushCreates
	 * pool. For a confirmed row it just wipes the diagnostic — the
	 * offending mutation is already gone from the queue.
	 */
	async retry(id: string): Promise<void> {
		await getClientDb().journalEntries.update(id, { syncError: null });
		notifySubscribers("journalEntries");
	},

	async setSyncError(id: string, error: string | null): Promise<void> {
		await getClientDb().journalEntries.update(id, { syncError: error });
		notifySubscribers("journalEntries", "sync");
	},

	/**
	 * Physically drop a single entry (and its child files) from Dexie.
	 * Used by `deleteOnlineFirst` on both branches (pending fast-path
	 * and post-server-confirm). Notifies as `"external"` so the sync
	 * orchestrator's queue-watcher doesn't ignore the mutation.
	 */
	async hardDelete(id: string): Promise<void> {
		await getClientDb().transaction(
			"rw",
			getClientDb().journalEntries,
			getClientDb().files,
			async () => {
				await getClientDb().journalEntries.delete(id);
				await getClientDb()
					.files.where({ tableName: "journalEntries" as const, tableId: id })
					.delete();
			},
		);
		notifySubscribers("journalEntries");
		notifySubscribers("files");
	},

	async wipeByTeamAppId(teamId: string): Promise<void> {
		await getClientDb().journalEntries.where({ teamId }).delete();
		await getClientDb().files
			.where({ teamId, tableName: "journalEntries" as const })
			.delete();
		notifySubscribers("journalEntries", "sync");
		notifySubscribers("files", "sync");
	},
};

async function mergeFilesFromServer(rows: FileSelectAll[]): Promise<void> {
	// Preserve local-only upload state; overwrite the metadata fields.
	await getClientDb().transaction("rw", getClientDb().files, async () => {
		for (const row of rows) {
			const existing = await getClientDb().files.get(row.id);
			if (existing) {
				await getClientDb().files.put({
					...existing,
					...row,
				});
			} else {
				await getClientDb().files.put({
					...row,
					mainUploadState: row.cdnUrl ? "uploaded" : "pending",
					mainUploadAttempts: 0,
					mainLastError: null,
					mainLastAttemptAt: null,
					mainChecksum: null,
					mainOpfsPath: null,
					thumbnailUploadState: row.thumbnailCdnUrl
						? "uploaded"
						: row.mimeType.startsWith("image/") || row.mimeType === "application/pdf"
							? "pending"
							: "not_attempted",
					thumbnailUploadAttempts: 0,
					thumbnailLastError: null,
					thumbnailLastAttemptAt: null,
					thumbnailChecksum: null,
					thumbnailOpfsPath: null,
					syncError: null,
				});
			}
		}
	});
}

// Local Dexie import — placed at the bottom so the file's exports live
// above the value-only import. Prevents circular hoisting quirks.
// biome-ignore lint/style/useImportType: Dexie's `minKey`/`maxKey` are value exports
import Dexie from "dexie";
