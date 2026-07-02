import { db } from "@backend/db/db";
import { rpcProtectedActiveTeamProcedure } from "@backend/procedures/protected.procedure";
import {
	journalEntryCreateInputZod,
	journalEntryDeleteZod,
	journalEntryGetByIdZod,
	journalEntryGetByUserZod,
	journalEntrySelectAllZod,
} from "@connected-repo/zod-schemas/journal_entry.zod";
import {
	journalEntryCreateInputWithRelationsZod,
	journalEntryPullBundlesInputZod,
	journalEntryPullBundlesOutputZod,
	journalEntryPushCreatesInputZod,
	journalEntryPushCreatesOutputZod,
	journalEntrySelectAllWithRelationsZod,
} from "@connected-repo/zod-schemas/journal-entries/sync";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";
import { userSelectAllZod } from "@connected-repo/zod-schemas/user.zod";
import { z } from "zod";
import { pushJournalEntryCreatesService } from "./services/push_creates.journal_entries.service";
import { pullJournalEntriesService } from "./services/sync.journal_entries.service";

// Postgres `time` values round-trip as `HH:mm:ss` but the zod contract on
// user.journalReminderTimes is `HH:mm`. The users table's inner column
// `.parse()` doesn't fire across array elements in orchid, so we strip at
// the boundary here — mirrors notifications.router#getReminderTimes.
const normalizeAuthorReminderTimes = <T extends { author?: UserSelectAll }>(
	entry: T,
): T => {
	if (!entry.author?.journalReminderTimes) return entry;
	return {
		...entry,
		author: {
			...entry.author,
			journalReminderTimes: entry.author.journalReminderTimes.map((v) =>
				v.length > 5 ? v.slice(0, 5) : v,
			),
		},
	};
};

// Get all journal entries for the caller in the active team.
const getAll = rpcProtectedActiveTeamProcedure
	.output(
		z.array(
			journalEntrySelectAllZod.extend({ author: userSelectAllZod.optional() }),
		),
	)
	.handler(async ({ context: { user, activeTeamId } }) => {
		const rows = await db.journalEntries
			.select("*", {
				author: (t) => t.author.selectAll(),
			})
			.where({ authorUserId: user.id, teamId: activeTeamId });
		return rows.map(normalizeAuthorReminderTimes);
	});

// Get journal entry by ID (scoped to the active team).
//
// Returns the entry with its `files` relation inlined so the caller has
// the complete detail-view payload in one round-trip. Matches the shape
// that `create` returns (same schema), keeping the frontend detail page
// on a single query rather than an entry + files pair.
const getById = rpcProtectedActiveTeamProcedure
	.input(journalEntryGetByIdZod)
	.output(journalEntrySelectAllWithRelationsZod)
	.handler(async ({ input: { id }, context: { user, activeTeamId } }) => {
		return await db.journalEntries
			.find(id)
			.where({ authorUserId: user.id, teamId: activeTeamId })
			.select("*", {
				files: (q) => q.files.selectAll(),
			});
	});

// Create journal entry.
//
// Accepts the SAME create-with-relations shape as `pushCreates`: parent +
// optional nested `files: FileCreateInput[]`. This keeps the online and
// offline write paths structurally identical — the `OnlineFirstAdapter`
// on the client sends the exact same payload whether it lands here
// immediately or falls back to the offline queue that flushes via
// `pushCreates`.
const create = rpcProtectedActiveTeamProcedure
	.input(journalEntryCreateInputWithRelationsZod)
	.output(journalEntrySelectAllWithRelationsZod)
	.handler(async ({ input, context: { user, activeTeamId } }) => {
		const { files, ...parent } = input;

		// `teamId` on both parent and nested files is server-owned — pulled
		// from `activeTeamId` on the auth context, NEVER from the client
		// input, to prevent tenant-forgery via a spread-in field.
		await db.journalEntries
			.create({
				...parent,
				authorUserId: user.id,
				teamId: activeTeamId,
				...(files?.length
					? {
							files: {
								create: files.map((f) => ({
									...f,
									teamId: activeTeamId,
									tableName: "journalEntries" as const,
									type: "attachment" as const,
									createdByUserId: user.id,
								})),
							},
						}
					: {}),
			})
			.onConflictDoNothing("id");

		// The `files` relation's `on: { tableName: "journalEntries", type: "attachment" }`
		// filter runs server-side, so this is one query.
		return await db.journalEntries.find(input.id).select("*", {
			files: (q) => q.files.selectAll(),
		});
	});

// Get journal entries by user, scoped to the caller's active team.
const getByUser = rpcProtectedActiveTeamProcedure
	.input(journalEntryGetByUserZod)
	.output(
		z.array(
			journalEntrySelectAllZod.extend({ author: userSelectAllZod.optional() }),
		),
	)
	.handler(async ({ input, context: { activeTeamId } }) => {
		const rows = await db.journalEntries
			.select("*", {
				author: (t) => t.author.selectAll(),
			})
			.where({ authorUserId: input.authorUserId, teamId: activeTeamId })
			.order({ createdAt: "DESC" });
		return rows.map(normalizeAuthorReminderTimes);
	});

// Update journal entry
const update = rpcProtectedActiveTeamProcedure
	.input(journalEntryCreateInputZod.extend({ id: z.ulid() }))
	.output(journalEntrySelectAllZod)
	.handler(async ({ input, context: { user, activeTeamId } }) => {
		const { id, ...updates } = input;

		return await db.journalEntries
			.find(id)
			.selectAll()
			.where({ authorUserId: user.id, teamId: activeTeamId })
			.update(updates);
	});

// Delete journal entry
const deleteEntry = rpcProtectedActiveTeamProcedure
	.input(journalEntryDeleteZod)
	.output(z.object({ success: z.boolean() }))
	.handler(async ({ input: { id }, context: { user, activeTeamId } }) => {
		await db.journalEntries
			.find(id)
			.where({ authorUserId: user.id, teamId: activeTeamId })
			.delete();

		return { success: true };
	});

// ─── Sync ───────────────────────────────────────────────────────────────

const pushCreates = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Journal Entries"] })
	.input(journalEntryPushCreatesInputZod)
	.output(journalEntryPushCreatesOutputZod)
	.handler(async ({ input, context: { user, activeTeamId } }) => {
		return await pushJournalEntryCreatesService(input, user.id, activeTeamId);
	});

const pullBundles = rpcProtectedActiveTeamProcedure
	.route({ method: "POST", tags: ["Journal Entries"] })
	.input(journalEntryPullBundlesInputZod)
	.output(journalEntryPullBundlesOutputZod)
	.handler(async ({ input, context: { user } }) => {
		return await pullJournalEntriesService(input, user.id);
	});

export const journalEntriesRouter = {
	getAll,
	getById,
	create,
	update,
	getByUser,
	delete: deleteEntry,
	pushCreates,
	pullBundles,
};
