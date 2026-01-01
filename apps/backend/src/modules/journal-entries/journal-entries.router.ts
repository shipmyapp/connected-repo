import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import {
	journalEntryCreateInputZod,
	journalEntryDeleteZod,
	journalEntryGetByIdZod,
	journalEntryGetByUserZod,
} from "@connected-repo/zod-schemas/journal_entry.zod";

// Get all journal entries for the authenticated user
const getAll = rpcProtectedProcedure.handler(async ({ context: { user } }) => {

	const journalEntries = await db.journalEntries
		.select("*", {
			author: (t) => t.author.selectAll(),
		})
		.where({ authorUserId: user.id });

	return journalEntries;
});

// Get journal entry by ID
const getById = rpcProtectedProcedure
	.input(journalEntryGetByIdZod)
	.handler(async ({ input: { journalEntryId }, context: { user } }) => {

		const journalEntry = await db.journalEntries
			.find(journalEntryId)
			.where({ authorUserId: user.id });

		return journalEntry;
	});

// Create journal entry
const create = rpcProtectedProcedure
	.input(journalEntryCreateInputZod)
	.handler(async ({ input, context: { user } }) => {

		const newJournalEntry = await db.journalEntries.create({
			...input,
			authorUserId: user.id,
		});

		return newJournalEntry;
	});

// Get journal entries by user
const getByUser = rpcProtectedProcedure
	.input(journalEntryGetByUserZod)
	.handler(async ({ input }) => {
		const journalEntries = await db.journalEntries
			.select("*", {
				author: (t) => t.author.selectAll(),
			})
			.where({ authorUserId: input.authorUserId })
			.order({ createdAt: "DESC" });

		return journalEntries;
	});

// Delete journal entry
const deleteEntry = rpcProtectedProcedure
	.input(journalEntryDeleteZod)
	.handler(async ({ input: { journalEntryId }, context: { user } }) => {
		await db.journalEntries.find(journalEntryId).where({ authorUserId: user.id }).delete();

		return { success: true };
	});

export const journalEntriesRouter = {
	getAll,
	getById,
	create,
	getByUser,
	delete: deleteEntry,
};
