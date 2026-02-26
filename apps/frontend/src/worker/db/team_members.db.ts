import { TeamAppMemberSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import { clientDb, notifySubscribers, type WithSync } from "./db.manager";

export class TeamMembersDBManager {
  getAll() {
    return clientDb.teamMembers.orderBy("email").toArray();
  }

  async saveMembers(members: TeamAppMemberSelectAll[]) {
    const data: WithSync<TeamAppMemberSelectAll>[] = members.map(m => ({
      ...m,
      _pendingAction: null,
    }));
    await clientDb.teamMembers.bulkPut(data);
    notifySubscribers("teamMembers");
  }

  getUserTeamMembers(userId: string) {
    // deletedAt is null
    return clientDb.teamMembers.where("userId").equals(userId).and((item) => item.deletedAt === null).toArray();
  }

  async wipeByTeamAppId(teamAppId: string) {
    await clientDb.teamMembers.where("teamId").equals(teamAppId).delete();
    notifySubscribers("teamMembers");
  }
}

export const teamMembersDb = new TeamMembersDBManager();