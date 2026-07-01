import type { TeamAppMemberSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import { getClientDb } from "./db.lifecycle";
import { notifySubscribers } from "./db.manager";

export const teamMembersDb = {
	async getAllForTeam(teamId: string): Promise<TeamAppMemberSelectAll[]> {
		return await getClientDb().teamMembers.where({ teamId }).toArray();
	},

	async bulkUpsert(rows: TeamAppMemberSelectAll[]): Promise<void> {
		if (rows.length === 0) return;
		await getClientDb().teamMembers.bulkPut(rows);
		notifySubscribers("teamMembers");
	},
};
