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
import { getDeltaFiles } from "../files/services/get_delta.files.service.js";
import { fileSelectAllZod } from "@connected-repo/zod-schemas/file.zod";

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
        cursorId: z.ulid().nullable(),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        tableName: z.enum(["teamsApp"]),
        data: z.array(teamAppSelectAllZod),
        cursorUpdatedAt: zTimeEpoch.nullable(),
        cursorId: z.ulid().nullable(),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        tableName: z.enum(["teamMembers"]),
        data: z.array(teamAppMemberSelectAllZod),
        cursorUpdatedAt: zTimeEpoch.nullable(),
        cursorId: z.ulid().nullable(),
        isLastChunk: z.boolean(),
        error: z.string().optional(),
    }),
    z.object({
		type: z.literal("delta"),
        tableName: z.enum(["files"]),
        data: z.array(fileSelectAllZod),
        cursorUpdatedAt: zTimeEpoch.nullable(),
        cursorId: z.ulid().nullable(),
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

const DELTA_FETCHERS: {
	[K in TablesToSync]: (userId: string, teamIds: string[], cursorDate: Date, cursorId: string | null, size: number) => Promise<Extract<DeltaOutput, { tableName: K }>["data"]>
} = {
	teamMembers: (userId, teamIds, cursorDate, cursorId, size) => getTeamMembersDelta(userId, teamIds, cursorDate, cursorId, size),
	teamsApp: (_userId, teamIds, cursorDate, cursorId, size) => getTeamAppDelta(teamIds, cursorDate, cursorId, size),
	journalEntries: (userId, teamIds, cursorDate, cursorId, size) => getDeltaJournalEntries(userId, teamIds, cursorDate, cursorId, size),
	prompts: (_userId, _teamIds, cursorDate, cursorId, size) => getDeltaPrompts(cursorDate, cursorId, size),
	files: (userId, teamIds, cursorDate, cursorId, size) => getDeltaFiles(userId, teamIds, cursorDate, cursorId, size),
};

async function* getDeltaForTable(
	tableName: TablesToSync,
	userId: string,
	userTeamsAppIds: string[],
	userOwnerAdminTeamAppIds: string[],
	since?: number,
	sinceCursorId?: string | null,
	signal?: AbortSignal,
): AsyncGenerator<DeltaOutput> {
	const userTeams = userTeamsAppIds.filter(Boolean);
	const adminTeams = userOwnerAdminTeamAppIds.filter(Boolean);
	const chunkSize = 100;

	let hasMore = true;
	let cursorUpdatedAtDate = new Date(since || 0);
	let cursorId = sinceCursorId ?? null;

	const fetcher = DELTA_FETCHERS[tableName];

	try {
		while (hasMore && !signal?.aborted) {
			const data = await fetcher(
				userId, 
				tableName === "teamsApp" ? userTeams : adminTeams, 
				cursorUpdatedAtDate, 
				cursorId, 
				chunkSize
			);

			if (data.length === 0) {
				yield { type: "delta", tableName, data: [], cursorUpdatedAt: null, cursorId: null, isLastChunk: true } as DeltaOutput;
				break;
			}

			const lastItem = data[data.length - 1]!;
			cursorUpdatedAtDate = new Date(lastItem.updatedAt);
			cursorId = lastItem.id;
			hasMore = data.length === chunkSize;

			yield {
				type: "delta",
				tableName,
				data,
				cursorUpdatedAt: lastItem.updatedAt,
				cursorId,
				isLastChunk: !hasMore,
			} as DeltaOutput;
		}
	} catch (error) {
		console.error(`[SyncRouter] Delta failed [${tableName}]:`, error);
		yield {
			type: "delta",
			tableName,
			data: [],
			cursorUpdatedAt: cursorUpdatedAtDate.getTime(),
			cursorId,
			isLastChunk: true,
			error: error instanceof Error ? error.message : "Database error",
		} as DeltaOutput;
	}
}

export const heartbeatSync = rpcProtectedProcedure
	.input(heartbeatSyncInput)
	.output(eventIterator(heartbeatSyncOutput))
	.handler(async function* ({ input: { type, tableMarkers }, context: { user: { id: userId }, resHeaders }, signal }) {
		// --- 0. Disable buffering for SSE (Nginx/Traefik compatibility) ---
		resHeaders?.set('X-Accel-Buffering', 'no');

		// Refetching user so as not to use andy cached data from middleware.
		const user = await db.users.find(userId).select("*", {
			teamMembers: (t) => t.teamMembers.selectAll()
		});

		// Real-time filtering for data privacy:
		const userTeamAppIds = user.teamMembers.map(m => m.teamId);
		const userOwnerAdminTeamAppIds = user.teamMembers
			.filter(m => m.role === "Owner" || m.role === "Admin")
			.map(m => m.teamId);

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
					userTeamAppIds,
					userOwnerAdminTeamAppIds,
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
			const isTeamOwnerAdminAccess =
				"syncToTeamAppIdOwnersAdmins" in payload &&
				payload.syncToTeamAppIdOwnersAdmins &&
				userOwnerAdminTeamAppIds.includes(payload.syncToTeamAppIdOwnersAdmins);

			const isTeamAllMemberAccess =
				"syncToTeamAppIdAllMembers" in payload &&
				payload.syncToTeamAppIdAllMembers &&
				userTeamAppIds.includes(payload.syncToTeamAppIdAllMembers);

			const isPersonalAccess = "syncToUserId" in payload && !!payload.syncToUserId && payload.syncToUserId === user.id;
			const isGlobalAccess = !("syncToUserId" in payload) && !("syncToTeamAppIdOwnersAdmins" in payload) && !("syncToTeamAppIdAllMembers" in payload);

			if (isTeamOwnerAdminAccess || isTeamAllMemberAccess || isPersonalAccess || isGlobalAccess) {
				yield payload;
			}

			// Membership Change Check: If any membership change (add, role change, remove)
			// affects the current user, we yield the payload FIRST so the frontend updates,
			// and then return to close the connection and force a context refresh.
			if (payload.type === "data-change-teamMembers") {
				const affectsMe = payload.data.some((m) => m.userId === user.id);
				if (affectsMe) {
					let shouldAbort = false;
					if (payload.operation === "create" || payload.operation === "delete") {
						shouldAbort = true;
					} else if (payload.operation === "update") {
						const myMembership = payload.data.find((m) => m.userId === user.id);
						const currentRole = user.teamMembers.find(
							(t) => t.id === myMembership?.id,
						)?.role;
						// Abort only in change of role.
						if (currentRole && myMembership && currentRole !== myMembership.role) {
							shouldAbort = true;
						}
					}
					if (shouldAbort) {
						console.log(
							`[SyncRouter] Critical membership change for user ${user.id}. Aborting sync for context refresh.`,
						);
						return;
					}
				}
			}
		}
	});

export const syncRouter = {
	heartbeatSync,
};
