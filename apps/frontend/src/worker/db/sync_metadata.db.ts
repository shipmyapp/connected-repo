import type { TablesToSync } from "@connected-repo/zod-schemas/enums.zod";
import type { SyncMetadata } from "@connected-repo/zod-schemas/sync.zod";
import { getClientDb } from "./db.lifecycle";
import { notifySubscribers } from "./db.manager";
import type { StoredSyncMetadata, SyncCycleState } from "./schema.db.types";

/**
 * Persistent cursor store, keyed by the composite `[syncedTable+teamId]`.
 * A user with membership in multiple teams keeps independent cursors for
 * each — switching teams (from the profile page) does not reset progress
 * in the team they left. The wave-1 `topLevelSyncedAt` snapshot ceiling
 * is stored globally (`syncState` singleton) since it's team-independent.
 */
export const syncMetadataDb = {
	async getCursor(
		syncedTable: TablesToSync,
		teamId: string,
	): Promise<StoredSyncMetadata | undefined> {
		return await getClientDb().syncMetadata.get([syncedTable, teamId]);
	},

	async saveCursor(
		syncedTable: TablesToSync,
		teamId: string,
		meta: SyncMetadata,
	): Promise<void> {
		const existing = await getClientDb().syncMetadata.get([syncedTable, teamId]);
		const next: StoredSyncMetadata = {
			...meta,
			teamId,
			syncedTable,
			lastTopLevelSyncedAt: existing?.lastTopLevelSyncedAt ?? null,
		};
		await getClientDb().syncMetadata.put(next);
		notifySubscribers("syncMetadata");
	},

	async saveTopLevelSyncedAt(teamId: string, topLevelSyncedAt: number): Promise<void> {
		const key: [TablesToSync, string] = ["teamsApp", teamId];
		const existing = await getClientDb().syncMetadata.get(key);
		if (existing) {
			await getClientDb().syncMetadata.put({
				...existing,
				lastTopLevelSyncedAt: topLevelSyncedAt,
			});
			notifySubscribers("syncMetadata");
		}
	},

	async getLastTopLevelSyncedAt(teamId: string): Promise<number | null> {
		const meta = await getClientDb().syncMetadata.get(["teamsApp", teamId]);
		return meta?.lastTopLevelSyncedAt ?? null;
	},

	async getCycleState(): Promise<SyncCycleState | undefined> {
		return await getClientDb().syncState.get("app");
	},

	async saveCycleState(patch: Partial<Omit<SyncCycleState, "key">>): Promise<void> {
		const existing =
			(await getClientDb().syncState.get("app")) ?? { key: "app" as const };
		await getClientDb().syncState.put({ ...existing, ...patch, key: "app" });
		notifySubscribers("syncState");
	},

	/**
	 * Drop every cursor for a specific team. Used when a user is removed
	 * from a team on the server — the local cache should stop trying to
	 * resume the old sync.
	 */
	async wipeForTeam(teamId: string): Promise<void> {
		await getClientDb().syncMetadata.where({ teamId }).delete();
		notifySubscribers("syncMetadata");
	},

	async wipeAll(): Promise<void> {
		await getClientDb().syncMetadata.clear();
		await getClientDb().syncState.clear();
		notifySubscribers("syncMetadata");
		notifySubscribers("syncState");
	},
};
