import { journalEntriesRouter } from '@backend/modules/journal-entries/journal-entries.router.js';
import { defaultContext } from '@backend/test/setup';
import { createJournalEntryFixture } from '@connected-repo/zod-schemas/journal_entry.fixture';
import { createRouterClient, type RouterClient } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';


describe('Journal Entries Endpoints', () => {
	let defaultClient: RouterClient<typeof journalEntriesRouter>;
	const unauthClient = createRouterClient(journalEntriesRouter);

	const dummyEntry = createJournalEntryFixture();

	beforeEach(() => {
		defaultClient = createRouterClient(journalEntriesRouter, {
			context: defaultContext,
		});
	});

	describe('getAll', () => {
		it('should return empty array when user has no journal entries', async () => {
			const result = await defaultClient.getAll();

			expect(result).toEqual([]);
		});

		it('should return user\'s journal entries', async () => {
			// Create a test journal entry first
			const createResult = await defaultClient.create(dummyEntry);

			expect(createResult).toBeDefined();
			expect(createResult.content).toBe(dummyEntry.content);

			// Now get all entries
			const result = await defaultClient.getAll();

			expect(result).toHaveLength(1);
			expect(result[0]?.content).toBe(dummyEntry.content);
			expect(result[0]?.authorUserId).toBe(defaultContext?.user.id);
		});

		it('should fail when user is not authenticated', async () => {
			await expect(unauthClient.getAll()).rejects.toThrow();
		});
	});

	describe('create', () => {
		it('should create a journal entry successfully', async () => {
			const result = await defaultClient.create(dummyEntry);

			expect(result).toBeDefined();
			expect(result.content).toBe(dummyEntry.content);
			expect(result.prompt).toBe(dummyEntry.prompt);
			expect(result.authorUserId).toBe(defaultContext?.user.id);
			expect(result.journalEntryId).toBeDefined();
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();
		});

		it('should create a journal entry without prompt', async () => {
			const result = await defaultClient.create({ content: dummyEntry.content });

			expect(result).toBeDefined();
			expect(result.content).toBe(dummyEntry.content);
			expect(result.prompt).toBeNull();
			expect(result.authorUserId).toBe(defaultContext?.user.id);
		});

		it('should fail when user is not authenticated', async () => {
			await expect(unauthClient.create(dummyEntry)).rejects.toThrow();
		});
	});
});