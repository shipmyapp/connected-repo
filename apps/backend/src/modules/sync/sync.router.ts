import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { eventIterator } from "@orpc/server";
import { z } from "zod";
import { type DeltaOutput, deltaOutputZod, syncPayloadZod, syncService } from "./sync.service";
import { db } from "@backend/db/db";

const heartbeatSyncInput = z.object({
	lastSyncTimestamps: z.record(z.string(), z.number()).optional(),
});

// Combine Delta events with Real-time Sync events
const heartbeatSyncOutput = z.discriminatedUnion("type", [
    deltaOutputZod,
    ...syncPayloadZod.options,
]);

async function* getDeltaForTable(
	tableName: "journalEntries" | "prompts",
	userId: string,
	since: number,
	signal?: AbortSignal,
): AsyncGenerator<DeltaOutput> {
	try {
		const thirtySecondsAgo = since - 30000;
		const chunkSize = 100;
		let currentFloor = thirtySecondsAgo;

		// 1. Determine the absolute overlap floor (Time-based vs. Count-based)
		if (tableName === "journalEntries") {
			const twentiethJE = await db.journalEntries
				.select("updatedAt")
				.where({ authorUserId: userId })
				.order({ updatedAt: "DESC" })
				.limit(20)
				.includeDeleted()
				.then((res) => res?.[res.length - 1]);

			const twentiethTime = twentiethJE?.updatedAt;
			currentFloor = Math.min(thirtySecondsAgo, twentiethTime ?? thirtySecondsAgo);
		} else if (tableName === "prompts") {
			const twentiethPrompt = await db.prompts
				.order({ updatedAt: "DESC" })
				.limit(20)
				.select("updatedAt")
				.includeDeleted()
				.then((res) => res?.[res.length - 1]);

			const twentiethTime = twentiethPrompt?.updatedAt;
			currentFloor = Math.min(thirtySecondsAgo, twentiethTime ?? thirtySecondsAgo);
		}

		// 2. Cursor-based pagination for the delta
		let hasMore = true;
		let cursorTimestamp = new Date(currentFloor);
		let cursorId: string | number | null = null;

		while (hasMore) {
			if (signal?.aborted) break;
			let data: any[] = [];

			if (tableName === "journalEntries") {
				const query = db.journalEntries
					.where({ authorUserId: userId })
					.select("*")
					.order({ updatedAt: "ASC", journalEntryId: "ASC" })
					.limit(chunkSize)
					.includeDeleted();

				if (cursorId === null) {
					data = await query.where({ updatedAt: { gte: cursorTimestamp } });
				} else {
					data = await query.where({
						OR: [
							{ updatedAt: { gt: cursorTimestamp } },
							{ updatedAt: cursorTimestamp, journalEntryId: { gt: cursorId as string } },
						],
					});
				}
			} else {
				const query = db.prompts
					.select("*")
					.order({ updatedAt: "ASC", promptId: "ASC" })
					.limit(chunkSize)
					.includeDeleted();

				if (cursorId === null) {
					data = await query.where({ updatedAt: { gte: cursorTimestamp } });
				} else {
					data = await query.where({
						OR: [
							{ updatedAt: { gt: cursorTimestamp } },
							{ updatedAt: cursorTimestamp, promptId: { gt: cursorId as number } },
						],
					});
				}
			}

			if (data.length === 0) {
				hasMore = false;
				yield {
					type: "delta",
					table: tableName,
					data: [],
					isLastChunk: true,
				};
				break;
			}

			// Update cursor for next batch
			const lastItem = data[data.length - 1];
			cursorTimestamp = lastItem.updatedAt;
			cursorId = tableName === "journalEntries" ? lastItem.journalEntryId : lastItem.promptId;
			hasMore = data.length === chunkSize;

			yield {
				type: "delta",
				table: tableName,
				data,
				isLastChunk: !hasMore,
			};
		}
	} catch (error) {
		console.error(`[SyncRouter] Delta sync failed for table ${tableName}:`, error);
		yield {
			type: "delta",
			table: tableName,
			data: [],
			isLastChunk: true,
			error: error instanceof Error ? error.message : "Unknown database error during delta sync",
		};
	}
}

export const heartbeatSync = rpcProtectedProcedure
	.input(heartbeatSyncInput)
	.output(eventIterator(heartbeatSyncOutput))
	.handler(async function* ({ input: { lastSyncTimestamps }, context: { user }, signal }) {

		// --- 1. Deliver Deltas (Delta-on-Connect) ---
		if (lastSyncTimestamps) {
			const tables = ["journalEntries", "prompts"] as const;
			let hasDeltaError = false;

			for (const tableName of tables) {
				for await (const chunk of getDeltaForTable(
					tableName,
					user.id,
					lastSyncTimestamps[tableName] ?? 0,
					signal,
				)) {
					yield chunk;
					if (chunk.error) {
						hasDeltaError = true;
						break;
					}
				}
				if (hasDeltaError) break;
			}

			if (hasDeltaError) {
				console.warn(`[SyncRouter] Aborting heartbeatSync for user ${user.id} due to delta error.`);
				return;
			}
		}

		// --- 2. Start Live Subscription after deltas are sent ---
		// This ensures that there are no gaps in the data. If partial data was sent earlier and 
		// the connection was lost, the client can request the missing data on next connection.
		// If live change is sent in between the updatedAt of live-change will allow gaps in existing data.
		const liveIterator = syncService.subscribe(signal);

		// --- 3. Start Live Monitoring (Buffered Events First) ---
			for await (const payload of liveIterator) {
				// Real-time filtering for data privacy:
				// Only yield if it belongs to this user OR if it's public (null userId)
				if (payload.userId === user.id || payload.userId === null) {
						yield payload;
				}
			}
	});

export const syncRouter = {
	heartbeatSync,
};
