import { db } from "@backend/db/db";
import type {
	JournalEntryCreateInputWithRelations,
	JournalEntryPushCreatesInput,
	JournalEntryPushCreatesOutput,
	JournalEntryPushCreatesResult,
} from "@connected-repo/zod-schemas/journal-entries/sync";

/**
 * Push a batch of offline-created journal entries (each with its optional
 * nested `files: FileCreateInput[]`).
 *
 * Fast path — one bulk `createMany` with nested `files: { create }` and
 * `onConflictDoNothing("id")`, then one nested-select refetch to echo the
 * canonical rows (parent + files) back to the client.
 *
 * Slow path — invoked only if the bulk path throws (a NOT NULL / FK /
 * check-constraint failure on some row rolled the whole batch back).
 * Iterates per row so bad rows land as `{ok:false, id, error}` without
 * taking the whole batch down.
 *
 * Idempotency — ULID `id` on parent AND every child file.
 * `onConflictDoNothing("id")` silently skips existing rows on retry. The
 * canonical-row fetch guarantees the response carries the server-owned
 * `updatedAt` for every id (including retries).
 */
export async function pushJournalEntryCreatesService(
	input: JournalEntryPushCreatesInput,
	authorUserId: string,
): Promise<JournalEntryPushCreatesOutput> {
	if (input.creates.length === 0) return { results: [] };

	try {
		const bulkResults = await tryBulkInsert(input.creates, authorUserId);
		return { results: bulkResults };
	} catch (bulkErr) {
		console.warn(
			"[journalEntries.pushCreates] bulk path failed; falling back to sequential per-row",
			bulkErr,
		);
	}

	const results: JournalEntryPushCreatesResult[] = [];
	for (const c of input.creates) {
		try {
			const row = await insertOne(c, authorUserId);
			results.push({ ok: true, id: c.id, row });
		} catch (err) {
			results.push({
				ok: false,
				id: c.id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}
	return { results };
}

async function tryBulkInsert(
	creates: JournalEntryCreateInputWithRelations[],
	authorUserId: string,
): Promise<JournalEntryPushCreatesResult[]> {
	await db.journalEntries
		.createMany(
			creates.map(({ files, ...parent }) => ({
				...parent,
				authorUserId,
				...(files?.length
					? {
							files: {
								create: files.map((f) => ({
									...f,
									tableName: "journalEntries" as const,
									type: "attachment" as const,
									createdByUserId: authorUserId,
								})),
							},
						}
					: {}),
			})),
		)
		.onConflictDoNothing("id");

	// One nested-select query — the `files` relation's `on` clause supplies
	// the tableName + type filter. Row-missing after this means the id was
	// silently skipped by the conflict handler AND no prior row exists,
	// which shouldn't happen but is treated as an error for safety.
	const parentIds = creates.map((c) => c.id);
	const rows = await db.journalEntries
		.where({ id: { in: parentIds } })
		.select("*", {
			files: (q) => q.files.selectAll(),
		});
	const rowById = new Map(rows.map((r) => [r.id, r]));

	return creates.map((c): JournalEntryPushCreatesResult => {
		const row = rowById.get(c.id);
		return row
			? { ok: true, id: c.id, row }
			: { ok: false, id: c.id, error: "Row missing after bulk insert" };
	});
}

async function insertOne(
	c: JournalEntryCreateInputWithRelations,
	authorUserId: string,
) {
	const { files, ...parent } = c;

	await db.journalEntries
		.create({
			...parent,
			authorUserId,
			...(files?.length
				? {
						files: {
							create: files.map((f) => ({
								...f,
								tableName: "journalEntries" as const,
								type: "attachment" as const,
								createdByUserId: authorUserId,
							})),
						},
					}
				: {}),
		})
		.onConflictDoNothing("id");

	return await db.journalEntries.find(c.id).select("*", {
		files: (q) => q.files.selectAll(),
	});
}
