import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { TeamAppSelectAll, teamAppSelectAllZod } from "@connected-repo/zod-schemas/team_app.zod";
import { TeamMemberTable } from "./team_members.table";

export class TeamAppTable extends BaseTable {
  readonly table = "teams_app";

  columns = this.setColumns((t) => ({
    teamAppId: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
    name: t.string(),
    logoUrl: t.string().nullable(),
    createdByUserId: t.uuid().foreignKey("users", "id", {
      onDelete: "CASCADE",
      onUpdate: "RESTRICT",
    }),
    deletedAt: t.timestampNumber().nullable(),

    ...t.timestamps(),
  }));

  readonly softDelete = true;

  relations = {
    members: this.hasMany(() => TeamMemberTable, {
      columns: ["teamAppId"],
      references: ["teamAppId"],
    }),
  }

  init() {
    this.afterCreate(teamAppSelectAllZod.keyof().options, (entries) => {
      for (const entry of entries) {
        syncService.push({
          type: "data-change-teamsApp",
          syncToTeamAppIdAllMembers: entry.teamAppId,
          operation: "create",
          data: [entry],
        });
      }
    });

    this.afterUpdate(teamAppSelectAllZod.keyof().options, (entries) => {
      for (const entry of entries) {
        syncService.push({
          type: "data-change-teamsApp",
          syncToTeamAppIdAllMembers: entry.teamAppId,
          operation: "update",
          data: [entry],
        });
      }
    });

    this.afterDelete(teamAppSelectAllZod.keyof().options, (entries) => {
      for (const entry of entries) {
        syncService.push({
          type: "data-change-teamsApp",
          syncToTeamAppIdAllMembers: entry.teamAppId,
          operation: "delete",
          data: [entry],
        });
      }
    });
  }
}