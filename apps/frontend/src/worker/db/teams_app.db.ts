import type { TeamAppSelectAll, TeamWithRole } from "@connected-repo/zod-schemas/team_app.zod";
import { db, notifySubscribers } from "./db.manager";
import { teamMembersDb } from "./team_members.db";

export class TeamsAppDBManager {
  async saveTeams(teams: TeamAppSelectAll[]) {
    await db.teamsApp.bulkPut(teams);
    notifySubscribers("teamsApp");
  }

  async getAll(): Promise<TeamAppSelectAll[]> {
    return await db.teamsApp.orderBy("name").toArray();
  }

  async getAllWithRole(userId: string): Promise<TeamWithRole[] | null> {
    const teamMembers = await teamMembersDb.getUserTeamMembers(userId);
    const teamAppIds = teamMembers.map((teamMember) => teamMember.teamAppId);
    if (teamAppIds.length === 0) {
      return null;
    };
    const teamApps = await db.teamsApp.where("teamAppId").anyOf(teamAppIds).toArray();
    const teamsAndRole = teamApps.map((teamApp) => {
      const teamMember = teamMembers.find((teamMember) => teamMember.teamAppId === teamApp.teamAppId);
      return {
        ...teamApp,
        userRole: teamMember?.role,
      };
    });
    return teamsAndRole.filter((t) => t.userRole) as TeamWithRole[];
  }

  async wipeByTeamAppId(teamAppId: string) {
    await db.teamsApp.where("teamAppId").equals(teamAppId).delete();
    await teamMembersDb.wipeByTeamAppId(teamAppId);
    notifySubscribers("teamsApp");
  }
}

export const teamsAppDb = new TeamsAppDBManager();
