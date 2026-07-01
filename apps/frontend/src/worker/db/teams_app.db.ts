import type { TeamAppSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import { getClientDb } from "./db.lifecycle";
import { notifySubscribers } from "./db.manager";

/**
 * Local mirror of the `teams_app` server table. Server-authored:
 * teams are created/edited via online RPCs; this store only receives
 * rows via `pullBundles`.
 */
export const teamsAppDb = {
	async getAll(): Promise<TeamAppSelectAll[]> {
		return await getClientDb().teamsApp.toArray();
	},

	async getById(id: string): Promise<TeamAppSelectAll | undefined> {
		return await getClientDb().teamsApp.get(id);
	},

	async bulkUpsert(rows: TeamAppSelectAll[]): Promise<void> {
		if (rows.length === 0) return;
		await getClientDb().teamsApp.bulkPut(rows);
		notifySubscribers("teamsApp");
	},

	async wipe(): Promise<void> {
		await getClientDb().teamsApp.clear();
		notifySubscribers("teamsApp");
	},
};
