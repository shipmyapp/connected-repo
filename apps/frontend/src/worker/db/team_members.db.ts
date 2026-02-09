import { TeamAppMemberSelectAll } from "@connected-repo/zod-schemas/team_app.zod";
import { db, notifySubscribers } from "./db.manager";

export class TeamMembersDBManager {
  async getAll(): Promise<TeamAppMemberSelectAll[]> {
    return await db.teamMembers.orderBy("email").toArray();
  }

  getUserTeamMembers(userId: string): Promise<TeamAppMemberSelectAll[]> {
    // deletedAt is null
    return db.teamMembers.where("userId").equals(userId).and((item) => item.deletedAt === null).toArray();
  }

  async wipeByTeamAppId(teamAppId: string) {
    await db.teamMembers.where("teamAppId").equals(teamAppId).delete();
    notifySubscribers("teamMembers");
  }
}

export const teamMembersDb = new TeamMembersDBManager();