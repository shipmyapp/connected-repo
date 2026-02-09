import { db } from "@backend/db/db";
import z from "zod";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import {
	journalEntryCreateInputZod,
	journalEntryDeleteZod,
	journalEntryGetByIdZod,
	journalEntryGetByUserZod,
} from "@connected-repo/zod-schemas/journal_entry.zod";

// Get all journal entries for the authenticated user, optionally filtered by team
const getAll = rpcProtectedProcedure
	.input(z.object({ teamId: z.uuid().nullable().optional() }))
	.handler(async ({ input: { teamId }, context: { user } }) => {
		const query: any = { authorUserId: user.id };
		if (teamId !== undefined) {
			query.teamId = teamId;
		}

		const journalEntries = await db.journalEntries
			.select("*", {
				author: (t) => t.author.selectAll(),
			})
			.where(query);

		return journalEntries;
	});

// Get journal entry by ID
const getById = rpcProtectedProcedure
	.input(journalEntryGetByIdZod.extend({ teamId: z.uuid().nullable().optional() }))
	.handler(async ({ input: { journalEntryId, teamId }, context: { user } }) => {
		const query: any = { journalEntryId, authorUserId: user.id };
		if (teamId !== undefined) {
			query.teamId = teamId;
		}

		const journalEntry = await db.journalEntries
			.find(journalEntryId)
			.where(query);

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
	.input(journalEntryDeleteZod.extend({ teamId: z.uuid().nullable().optional() }))
	.handler(async ({ input: { journalEntryId, teamId }, context: { user } }) => {
		const query: any = { journalEntryId, authorUserId: user.id };
		if (teamId !== undefined) {
			query.teamId = teamId;
		}
		
		await db.journalEntries.find(journalEntryId).where(query).delete();

		return { success: true };
	});

export const journalEntriesRouter = {
	getAll,
	getById,
	create,
	getByUser,
	delete: deleteEntry,
};
