import { TeamAppMemberSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import { clientDb, notifySubscribers, type WithSync } from "./db.manager";

export class TeamMembersDBManager {
  async getAll(): Promise<TeamAppMemberSelectAll[]> {
    return await clientDb.teamMembers.orderBy("email").toArray();
  }

  async saveMembers(members: TeamAppMemberSelectAll[]) {
    const data: WithSync<TeamAppMemberSelectAll>[] = members.map(m => ({
      ...m,
      _pendingAction: null,
      clientUpdatedAt: m.updatedAt,
    }));
    await clientDb.teamMembers.bulkPut(data);
    notifySubscribers("teamMembers");
  }

  getUserTeamMembers(userId: string): Promise<TeamAppMemberSelectAll[]> {
    // deletedAt is null
    return clientDb.teamMembers.where("userId").equals(userId).and((item) => item.deletedAt === null).toArray();
  }

  async wipeByTeamAppId(teamAppId: string) {
    await clientDb.teamMembers.where("teamAppId").equals(teamAppId).delete();
    notifySubscribers("teamMembers");
  }
}

export const teamMembersDb = new TeamMembersDBManager();