import { db } from "@backend/db/db";
import { requestContext } from "@backend/lib/request-context";
import { journalEntriesRouter } from "@backend/modules/journal-entries/journal-entries.router.js";
import { defaultContext } from "@backend/test/setup";
import type { SyncMetadata } from "@connected-repo/zod-schemas/sync.zod";
import { createRouterClient, type RouterClient } from "@orpc/server";
import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";

describe("pull-delta cursor (journalEntries.pullBundles)", () => {
	let client: RouterClient<typeof journalEntriesRouter>;

	beforeEach(() => {
		client = createRouterClient(journalEntriesRouter, { context: defaultContext });
	});

	/**
	 * Insert journal entries as the active tenant. `journal_entries.teamId`
	 * is stamped by `setOnCreate` from the request context (it ignores an
	 * explicit value), so bulk inserts must run inside `requestContext.run`
	 * or the rows land with `teamId: null` and the team-scoped pull skips them.
	 */
	async function seedEntries(
		teamId: string,
		userId: string,
		teamMemberId: string,
		rows: { id?: string; content: string }[],
	): Promise<void> {
		await requestContext.run(
			{ tenantTeamId: teamId, userId, teamMemberId, teamMemberRole: "Owner" },
			async () => {
				await db.journalEntries.createMany(
					rows.map((r) => ({ id: ulid(), ...r, authorUserId: userId })),
				);
			},
		);
	}

	/** Drain every page from `startCursor` forward; return all rows + ids seen. */
	async function drain(startCursor: SyncMetadata | null): Promise<{
		ids: Set<string>;
		contents: string[];
		cursor: SyncMetadata | null;
	}> {
		const ids = new Set<string>();
		const contents: string[] = [];
		let cursor = startCursor;
		for (let i = 0; i < 25; i++) {
			const res = await client.pullBundles({
				syncMetadata: cursor,
				topLevelSyncedAt: Date.now(),
			});
			cursor = res.syncMetadata;
			for (const row of res.rows) {
				if (!ids.has(row.id)) contents.push(row.content);
				ids.add(row.id);
			}
			if (res.rows.length === 0) break;
		}
		return { ids, contents, cursor };
	}

	it("returns every row when far more than one page changed since the last sync (Q5 overflow)", async () => {
		const teamId = defaultContext?.user.activeTeamAppId;
		const authorUserId = defaultContext?.user.id;
		if (!teamId || !authorUserId) throw new Error("test context missing");
		const membership = await db.teamMembers
			.unscope("default")
			.where({ teamId, userId: authorUserId })
			.take();

		// Seed a few rows and sync so the `toCursor` sits at the newest of them.
		await seedEntries(
			teamId,
			authorUserId,
			membership.id,
			Array.from({ length: 5 }, (_, i) => ({ content: `seed-${i}` })),
		);
		const first = await drain(null);
		expect(first.ids.size).toBe(5);

		// Now create 150 NEW rows — all newer than the cursor and far more than
		// one 100-row page. The old single-DESC-page design advanced `toCursor`
		// to the newest row and orphaned the middle band; the ASC catch-up must
		// deliver all 150 across pages with no gap. (Ids are DB-generated to
		// keep the test independent of client id minting.)
		await seedEntries(
			teamId,
			authorUserId,
			membership.id,
			Array.from({ length: 150 }, (_, i) => ({ content: `new-${i}` })),
		);

		const second = await drain(first.cursor);

		const newSeen = second.contents.filter((c) => c.startsWith("new-"));
		// Every one of the 150 new rows arrived, exactly once — no gap, no dupe.
		expect(new Set(newSeen).size).toBe(150);
	});
});
