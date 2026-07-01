import { db } from "@backend/db/db";
import { syncDeltaService } from "@backend/modules/sync/services/sync_delta.sync.service";
import type { JournalEntrySelectAll } from "@connected-repo/zod-schemas/journal_entry.zod";
import type {
	JournalEntryPullBundlesInput,
	JournalEntryPullBundlesOutput,
} from "@connected-repo/zod-schemas/journal-entries/sync";

/**
 * Scope: rows authored by the calling user within the active tenant team.
 * The tenant filter is applied automatically by JournalEntryTable's default
 * scope (reads from AsyncLocalStorage). We only add the author filter here.
 */
export async function pullJournalEntriesService(
	input: JournalEntryPullBundlesInput,
	authorUserId: string,
): Promise<JournalEntryPullBundlesOutput> {
	const baseQuery = db.journalEntries.where({ authorUserId });

	const { data, syncMetadata } = await syncDeltaService<JournalEntrySelectAll>({
		// biome-ignore lint/suspicious/noExplicitAny: __scopes generic mismatch when narrowing bare table query
		baseQuery: baseQuery as any,
		syncMetadataInput: input.syncMetadata,
		topLevelSyncedAt: input.topLevelSyncedAt,
		syncedTable: "journalEntries",
	});

	return { rows: data, syncMetadata };
}
