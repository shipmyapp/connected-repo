import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { eventIterator } from "@orpc/server";
import { z } from "zod";
import { syncPayloadZod, syncService } from "./sync.service.js";
import { syncVisibilityService } from "./sync.visibility.service.js";
import { teamAppMemberSelectAllZod, teamAppSelectAllZod } from "@connected-repo/zod-schemas/team_app.zod";
import { promptSelectAllZod } from "@connected-repo/zod-schemas/prompt.zod";
import { journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";

export const deltaOutputZod = z.discriminatedUnion("table", [
    z.object({
		type: z.literal("delta"),
        table: z.enum(["journalEntries"]),
        data: z.array(journalEntrySelectAllZod),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        table: z.enum(["prompts"]),
        data: z.array(promptSelectAllZod),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        table: z.enum(["teamsApp"]),
        data: z.array(teamAppSelectAllZod),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        table: z.enum(["teamMembers"]),
        data: z.array(teamAppMemberSelectAllZod),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    })
]);
export type DeltaOutput = z.infer<typeof deltaOutputZod>;

const heartbeatSyncInput = z.object({
	lastSyncTimestamps: z.record(z.string(), z.number()).optional(),
});

// Combine Delta events with Real-time Sync events
const heartbeatSyncOutput = z.discriminatedUnion("type", [
    deltaOutputZod,
    ...syncPayloadZod.options,
]);

async function* getDeltaForTable(
	tableName: "journalEntries" | "prompts" | "teamsApp" | "teamMembers",
	userId: string,
	userTeamsAppIds: string[],
	userOwnerAdminTeamAppIds: string[],
	since: number,
	signal?: AbortSignal,
): AsyncGenerator<DeltaOutput> {
	// Clean up inputs to avoid IN (NULL/undefined) or empty array issues
	userTeamsAppIds = userTeamsAppIds.filter(id => !!id);
	userOwnerAdminTeamAppIds = userOwnerAdminTeamAppIds.filter(id => !!id);

	try {
		const thirtySecondsAgo = since - 30000;
		const chunkSize = 100;
		let currentFloor = thirtySecondsAgo;

		// 1. Determine the absolute overlap floor (Time-based vs. Count-based)
		if (tableName === "journalEntries") {
			let where: Record<string, string | any[]> = { authorUserId: userId };
			if (userTeamsAppIds.length > 0) {
				where = { 
					OR: [
						{ authorUserId: userId },
						{ teamId: { in: userTeamsAppIds } }
					]
				};
			}
			const twentiethJE = await db.journalEntries
				.select("updatedAt")
				.where(where)
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
				const where: Record<string, string | any[]> = { authorUserId: userId };
				if (userOwnerAdminTeamAppIds.length > 0) {
					where.OR = [
						{ authorUserId: userId },
						{ teamId: { in: userOwnerAdminTeamAppIds } }
					];
				}
				let query = db.journalEntries
                    .includeDeleted()
					.where(where)
					.select("*")
					.order({ updatedAt: "ASC", journalEntryId: "ASC" })
					.limit(chunkSize);

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
			} else if (tableName === "teamsApp") {
				if (userTeamsAppIds.length > 0) {
					let query = db.teamsApp
						.includeDeleted()
						.where({ teamAppId: { in: userTeamsAppIds } })
						.select("*")
						.order({ updatedAt: "ASC", teamAppId: "ASC" })
						.limit(chunkSize);

					if (cursorId === null) {
						data = await query.where({ updatedAt: { gte: cursorTimestamp } });
					} else {
						data = await query.where({
							OR: [
								{ updatedAt: { gt: cursorTimestamp } },
								{ updatedAt: cursorTimestamp, teamAppId: { gt: cursorId as string } },
							],
						});
					}
				}
			} else if (tableName === "teamMembers") {
				const where: Record<string, string | any[]> = { userId };
				if (userOwnerAdminTeamAppIds.length > 0) {
					where.OR = [
						{ teamAppId: { in: userOwnerAdminTeamAppIds } },
						{ userId }
					];
				}

				let query = db.teamMembers
                    .includeDeleted()
                    .where(where)
					.select("*")
					.order({ updatedAt: "ASC", teamMemberId: "ASC" })
					.limit(chunkSize);

				if (cursorId === null) {
					data = await query.where({ updatedAt: { gte: cursorTimestamp } });
				} else {
					data = await query.where({
						OR: [
							{ updatedAt: { gt: cursorTimestamp } },
							{ updatedAt: cursorTimestamp, teamMemberId: { gt: cursorId as string } },
						],
					});
				}
			} else if (tableName === "prompts") {
				let query = db.prompts
                    .includeDeleted()
					.select("*")
					.order({ updatedAt: "ASC", promptId: "ASC" })
					.limit(chunkSize);

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
            if (tableName === "journalEntries") cursorId = lastItem.journalEntryId;
            else if (tableName === "teamsApp") cursorId = lastItem.teamAppId;
            else if (tableName === "teamMembers") cursorId = lastItem.teamMemberId;
            else if (tableName === "prompts") cursorId = lastItem.promptId;

			hasMore = data.length === chunkSize;

			yield {
				type: "delta",
				table: tableName,
				data,
				isLastChunk: !hasMore,
			};
		}
	} catch (error) {
		console.error(`[SyncRouter] Delta sync failed for table ${tableName}:`, error, {
            userId,
            userTeamsAppIds,
            userOwnerAdminTeamAppIds,
            since
        });
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
			const tables = ["teamsApp", "teamMembers", "journalEntries", "prompts"] as const;
			let hasDeltaError = false;

			for (const tableName of tables) {
				for await (const chunk of getDeltaForTable(
					tableName,
					user.id,
					user.teamMembers.map(m => m.teamAppId),
					user.teamMembers.filter(m => m.role === "Owner" || m.role === "Admin").map(m => m.teamAppId),
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

			const isTeamOwnerAdminAccess =
				"syncToTeamAppIdOwnersAdmins" in payload &&
				payload.syncToTeamAppIdOwnersAdmins &&
				user.teamMembers.some(
					(t) =>
						t.teamAppId === payload.syncToTeamAppIdOwnersAdmins &&
						(t.role === "Owner" || t.role === "Admin"),
				);

			const isTeamAllMemberAccess =
				"syncToTeamAppIdAllMembers" in payload &&
				payload.syncToTeamAppIdAllMembers &&
				user.teamMembers.some((t) => t.teamAppId === payload.syncToTeamAppIdAllMembers);

			const isPersonalAccess = "syncToUserId" in payload && payload.syncToUserId === user.id;

			const isGlobalAccess =
				!("syncToUserId" in payload) ||
				payload.syncToUserId === null ||
				payload.syncToUserId === undefined;

			if (isTeamOwnerAdminAccess || isTeamAllMemberAccess || isPersonalAccess || isGlobalAccess) {
				// Membership Change Check: If any membership change (add, role change, remove)
				// affects the current user, we yield the payload FIRST so the frontend updates,
				// and then return to close the connection and force a context refresh.
				let shouldAbort = false;
				if (payload.type === "data-change-teamMembers") {
					const affectsMe = payload.data.some((m) => m.userId === user.id);
					if (affectsMe) {
						if (payload.operation === "create" || payload.operation === "delete") {
							shouldAbort = true;
						} else if (payload.operation === "update") {
							const myMembership = payload.data.find((m) => m.userId === user.id);
							const currentRole = user.teamMembers.find(
								(t) => t.teamAppId === myMembership?.teamAppId,
							)?.role;
							// Abort only in change of role.
							if (currentRole && myMembership && currentRole !== myMembership.role) {
								shouldAbort = true;
							}
						}
					}
				}

				yield payload;

				if (shouldAbort) {
					console.log(
						`[SyncRouter] Critical membership change for user ${user.id}. Aborting sync for context refresh.`,
					);
					return;
				}
			}
		}
	});

export const syncRouter = {
	heartbeatSync,
};
