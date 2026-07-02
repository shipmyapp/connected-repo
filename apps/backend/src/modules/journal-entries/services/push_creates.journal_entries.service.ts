import { db } from "@backend/db/db";
import { logger } from "@backend/utils/logger.utils";
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
 * Falls back to per-record `db.$transaction` in `Promise.allSettled`
 * batches of 10 so bad rows land as `{ok:false, id, error}` without
 * taking the whole batch down, and concurrency stays bounded.
 *
 * Idempotency — ULID `id` on parent AND every child file.
 * `onConflictDoNothing("id")` silently skips existing rows on retry. The
 * canonical-row fetch guarantees the response carries the server-owned
 * `updatedAt` for every id (including retries).
 */
export async function pushJournalEntryCreatesService(
	input: JournalEntryPushCreatesInput,
	authorUserId: string,
	activeTeamId: string,
): Promise<JournalEntryPushCreatesOutput> {
	if (input.creates.length === 0) return { results: [] };

	try {
		const bulkResults = await tryBulkInsert(input.creates, authorUserId, activeTeamId);
		return { results: bulkResults };
	} catch (bulkErr) {
		logger.warn(
			{ err: bulkErr, count: input.creates.length },
			"[journalEntries.pushCreates] bulk path failed; falling back to sequential per-row",
		);
	}

	// Per-record fallback: each row runs in its own `db.$transaction` so a bad
	// row does not poison siblings. Batches of 10 cap concurrency. Output is
	// indexed 1:1 with `input.creates` (order preserved).
	const results: JournalEntryPushCreatesResult[] = [];
	for (let i = 0; i < input.creates.length; i += 10) {
		const batch = input.creates.slice(i, i + 10);
		const settled = await Promise.allSettled(
			batch.map((rec) => db.$transaction(() => insertOne(rec, authorUserId, activeTeamId))),
		);
		settled.forEach((result, idx) => {
			const rec = batch[idx];
			if(!rec) {
				throw new Error("[journalEntries.pushCreates] Batch index out of bounds in fallback");
			}
			if (result.status === "fulfilled") {
				results.push({ ok: true, id: rec.id, row: result.value });
			} else {
				results.push({
					ok: false,
					id: rec.id,
					error:
						result.reason instanceof Error ? result.reason.message : String(result.reason),
				});
			}
		});
	}
	return { results };
}

async function tryBulkInsert(
	creates: JournalEntryCreateInputWithRelations[],
	authorUserId: string,
	activeTeamId: string,
): Promise<JournalEntryPushCreatesResult[]> {
	await db.journalEntries
		.createMany(
			creates.map(({ files, ...parent }) => ({
				...parent,
				authorUserId,
				teamId: activeTeamId,
				...(files?.length
					? {
							files: {
								create: files.map((f) => ({
									...f,
									teamId: activeTeamId,
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
	activeTeamId: string,
) {
	const { files, ...parent } = c;

	await db.journalEntries
		.create({
			...parent,
			authorUserId,
			teamId: activeTeamId,
			...(files?.length
				? {
						files: {
							create: files.map((f) => ({
								...f,
								teamId: activeTeamId,
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
