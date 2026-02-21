import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";
import { eventIterator } from "@orpc/server";
import { z } from "zod";
import { syncPayloadZod, syncService } from "./sync.service.js";
import { teamAppMemberSelectAllZod, teamAppSelectAllZod } from "@connected-repo/zod-schemas/team_app.zod";
import { promptSelectAllZod } from "@connected-repo/zod-schemas/prompt.zod";
import { journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import { zSmallint, zTimeEpoch } from "@connected-repo/zod-schemas/zod_utils";
import { TABLES_TO_SYNC_ENUM, TablesToSync, tablesToSyncZod } from "@connected-repo/zod-schemas/enums.zod";
import { getDeltaPrompts } from "../prompts/servies.get_delta.prompts.service.js";
import { getDeltaJournalEntries } from "../journal-entries/services/get_delta.journal_entries.service.js";
import { getTeamAppDelta } from "../teams/services/get_team_app_delta.teams.service.js";
import { getTeamMembersDelta } from "../teams/services/get_team_members_delta.teams.service.js";

export const deltaOutputZod = z.discriminatedUnion("tableName", [
    z.object({
		type: z.literal("delta"),
        tableName: z.enum(["journalEntries"]),
        data: z.array(journalEntrySelectAllZod),
        cursorUpdatedAt: zTimeEpoch.nullable(),
        cursorId: z.ulid().nullable(),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        tableName: z.enum(["prompts"]),
        data: z.array(promptSelectAllZod),
        cursorUpdatedAt: zTimeEpoch.nullable(),
        cursorId: z.coerce.string().nullable(),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        tableName: z.enum(["teamsApp"]),
        data: z.array(teamAppSelectAllZod),
        cursorUpdatedAt: zTimeEpoch.nullable(),
        cursorId: z.uuid().nullable(),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        tableName: z.enum(["teamMembers"]),
        data: z.array(teamAppMemberSelectAllZod),
        cursorUpdatedAt: zTimeEpoch.nullable(),
        cursorId: z.uuid().nullable(),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    })
]);
export type DeltaOutput = z.infer<typeof deltaOutputZod>;

const heartbeatSyncInput = z.object({
	type: z.literal("heartbeat"),
	tableMarkers: z.array(z.object({
			tableName: tablesToSyncZod,
			cursorUpdatedAt: zTimeEpoch,
			cursorId: z.string().nullable(),
		})),
});

// Combine Delta events with Real-time Sync events
const heartbeatSyncOutput = z.discriminatedUnion("type", [
    deltaOutputZod,
    ...syncPayloadZod.options,
]);

async function* getDeltaForTable(
	tableName: TablesToSync,
	userId: string,
	userTeamsAppIds: string[],
	userOwnerAdminTeamAppIds: string[],
	since?: number,
	sinceCursorId?: string | null,
	signal?: AbortSignal,
): AsyncGenerator<DeltaOutput> {
	// Clean up inputs to avoid IN (NULL/undefined) or empty array issues
	userTeamsAppIds = userTeamsAppIds.filter(id => !!id);
	userOwnerAdminTeamAppIds = userOwnerAdminTeamAppIds.filter(id => !!id);

	const chunkSize = 100;

	let hasMore = true;
	let cursorUpdatedAtDate: Date = new Date(since || 0);
	let cursorId: string | null = sinceCursorId ?? null;

	try {
		while (hasMore) {
			if (signal?.aborted) break;
			let data: any[] = [];

			if (tableName === "teamMembers") {
				data = await getTeamMembersDelta(
					userId,
					userOwnerAdminTeamAppIds,
					cursorUpdatedAtDate,
					cursorId,
					chunkSize
				);
			} else if (tableName === "teamsApp") {
				data = await getTeamAppDelta(
					userTeamsAppIds,
					cursorUpdatedAtDate,
					cursorId,
					chunkSize
				);
			} else if (tableName === "journalEntries") {
				data = await getDeltaJournalEntries(
					userId,
					userOwnerAdminTeamAppIds,
					cursorUpdatedAtDate,
					cursorId,
					chunkSize
				);
			} else if (tableName === "prompts") {
				data = await getDeltaPrompts(
					cursorUpdatedAtDate,
					cursorId ? Number(cursorId) : null,
					chunkSize
				);
			}

			if (data.length === 0) {
				hasMore = false;
				yield {
					type: "delta",
					tableName,
					data: [],
					cursorUpdatedAt: null,
					cursorId: null,
					isLastChunk: true,
				};
				break;
			}

			// Update cursor for next batch
			const lastItem = data[data.length - 1];
			const batchMaxUpdatedAt = lastItem.updatedAt;
			cursorUpdatedAtDate = new Date(batchMaxUpdatedAt);
            if (tableName === "journalEntries") cursorId = lastItem.journalEntryId;
			else if (tableName === "prompts") cursorId = lastItem.promptId;
            else if (tableName === "teamsApp") cursorId = lastItem.teamAppId;
            else if (tableName === "teamMembers") cursorId = lastItem.teamMemberId;

			hasMore = data.length === chunkSize;

			yield {
				type: "delta",
				tableName,
				data,
				cursorUpdatedAt: batchMaxUpdatedAt,
				cursorId,
				isLastChunk: !hasMore,
			};

		}
	} catch (error) {
		console.error(`[SyncRouter] Delta sync failed for table ${tableName}:`, error, {
            userId,
            userTeamsAppIds,
            userOwnerAdminTeamAppIds,
            cursorUpdatedAt: cursorUpdatedAtDate.getTime(),
            cursorId,
        });
		yield {
			type: "delta",
			tableName: tableName,
			data: [],
			cursorUpdatedAt: cursorUpdatedAtDate.getTime(),
			cursorId,
			isLastChunk: true,
			error: error instanceof Error ? error.message : "Unknown database error during delta sync",
		};
	}
}

export const heartbeatSync = rpcProtectedProcedure
	.input(heartbeatSyncInput)
	.output(eventIterator(heartbeatSyncOutput))
	.handler(async function* ({ input: { type, tableMarkers }, context: { user, resHeaders }, signal }) {
		// --- 0. Disable buffering for SSE (Nginx/Traefik compatibility) ---
		resHeaders?.set('X-Accel-Buffering', 'no');

		console.info(`[SyncRouter] New connection from user ${user.id} (Table markers: ${tableMarkers.length})`);

		// --- 1. Start Live Subscription FIRST (Buffer incoming events to avoid gaps) ---
		// We start the iterator early but don't pull from it until deltas are delivered.
		const liveIterator = syncService.subscribe(signal);

		// --- 2. Deliver Deltas (Delta-on-Connect) ---
		if (type === "heartbeat") {
			// Immediately yield a heartbeat to acknowledge connection and reset SW watchdog
			console.info(`[SyncRouter] Sending initial heartbeat for user ${user.id}`);
			yield { type: "heartbeat" };

			let hasDeltaError = false;

			for (const tableName of TABLES_TO_SYNC_ENUM) {
				const { cursorUpdatedAt, cursorId } = tableMarkers.find(tm => tm.tableName === tableName) || {};
				for await (const chunk of getDeltaForTable(
					tableName,
					user.id,
					user.teamMembers.map(m => m.teamAppId),
					user.teamMembers.filter(m => m.role === "Owner" || m.role === "Admin").map(m => m.teamAppId),
					cursorUpdatedAt,
					cursorId,
					signal,
				)) {
					console.info(`[SyncRouter] Yielding delta chunk for table ${tableName} to user ${user.id}`);
					yield chunk;
					if (chunk.error) {
						hasDeltaError = true;
						break;
					}
				}
				if (hasDeltaError) break;

				// Yield heartbeat between tables to maintain connection during potentially slow table transitions
				console.info(`[SyncRouter] Sending transition heartbeat for user ${user.id}`);
				yield { type: "heartbeat" };
			}

			if (hasDeltaError) {
				console.warn(`[SyncRouter] Aborting heartbeatSync for user ${user.id} due to delta error.`);
				return;
			}
		}

		// --- 3. Start Live Monitoring (Buffered Events First) ---
		for await (const payload of liveIterator) {
			// Real-time filtering for data privacy:
			const userTeamMemberIds = user.teamMembers.map(m => m.teamAppId);
			const userOwnerAdminTeamMemberIds = user.teamMembers
				.filter(m => m.role === "Owner" || m.role === "Admin")
				.map(m => m.teamAppId);

			const isTeamOwnerAdminAccess =
				"syncToTeamAppIdOwnersAdmins" in payload &&
				payload.syncToTeamAppIdOwnersAdmins &&
				userOwnerAdminTeamMemberIds.includes(payload.syncToTeamAppIdOwnersAdmins);

			const isTeamAllMemberAccess =
				"syncToTeamAppIdAllMembers" in payload &&
				payload.syncToTeamAppIdAllMembers &&
				userTeamMemberIds.includes(payload.syncToTeamAppIdAllMembers);

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
