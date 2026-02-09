import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { TeamAppMemberSelectAll, teamAppMemberSelectAllZod } from "@connected-repo/zod-schemas/team_app.zod";

// Group by TeamAppId and push to person who has been edited/added and owners/admins of the team
const pushTeamMembersToSync = (operation: "create" | "update" | "delete", entries: TeamAppMemberSelectAll[]) => {
  const groups = new Map<string, TeamAppMemberSelectAll[]>();

  for (const entry of entries) {
    // Group by teamAppId and push to person who has been edited/added and owners/admins of the team
    const key = `${entry.teamAppId}:${entry.userId}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  }

  for (const [key, data] of groups.entries()) {
    const [teamAppId, userId] = key.split(":");
    syncService.push({
      type: "data-change-teamMembers",
      syncToUserId: userId!,
      syncToTeamAppIdOwnersAdmins: teamAppId,
      operation,
      data,
    });
  }
};

export class TeamMemberTable extends BaseTable {
  readonly table = "team_members";

  columns = this.setColumns((t) => ({
    teamMemberId: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
    teamAppId: t.uuid().foreignKey("teams_app", "teamAppId", {
        onUpdate: "RESTRICT",
        onDelete: "CASCADE",
    }),
    userId: t.uuid().foreignKey("users", "id", {
        onUpdate: "RESTRICT",
        onDelete: "SET NULL",
    }).nullable(),
    email: t.string().nullable(),
    role: t.teamMemberRoleEnum(),
    addedAt: t.timestampNumber().default(t.sql`NOW()`),
    joinedAt: t.timestampNumber().nullable(),
    deletedAt: t.timestampNumber().nullable(),

    ...t.timestamps(),
  }));

  readonly softDelete = true;

  init() {
    this.afterCreate(teamAppMemberSelectAllZod.keyof().options, (entries) => {
      pushTeamMembersToSync("create", entries);
    });

    this.afterUpdate(teamAppMemberSelectAllZod.keyof().options, (entries) => {
      pushTeamMembersToSync("update", entries);
    });

    this.afterDelete(teamAppMemberSelectAllZod.keyof().options, (entries) => {
      pushTeamMembersToSync("delete", entries);
    });
  }
}