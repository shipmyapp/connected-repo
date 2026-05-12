import { env, isTest } from "@backend/configs/env.config";
import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { TeamAppSelectAll, teamAppSelectAllZod } from "@connected-repo/zod-schemas/team_app.zod";
import { TeamMemberTable } from "./team_members.table";

export class TeamAppTable extends BaseTable {
  readonly table = "teams_app";

  columns = this.setColumns((t) => ({
    id: t.ulidWithDefault().primaryKey(),
    name: t.string(),
    logoUrl: t.string().nullable(),
    createdByUserId: t.uuid().foreignKey("users", "id", {
      onDelete: "CASCADE",
      onUpdate: "RESTRICT",
    }),
    personalTeamForUserId: t.uuid().foreignKey("users", "id", {
      onDelete: "CASCADE",
      onUpdate: "RESTRICT",
    }).nullable(),
    deletedAt: t.timestampNumber().nullable(),

    ...t.timestamps(),
  }));

  // Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
  readonly softDelete = true;

  relations = {
    members: this.hasMany(() => TeamMemberTable, {
      columns: ["id"],
      references: ["teamId"],
    }),
  }

  init() {
    this.afterCreate(teamAppSelectAllZod.keyof().options, (entries) => {
      for (const entry of entries) {
        syncService.push({
          type: "data-change-teamsApp",
          syncToTeamAppIdAllMembers: entry.id,
          operation: "create",
          data: [entry],
        });
      }
    });

    this.afterUpdate(teamAppSelectAllZod.keyof().options, (entries) => {
      for (const entry of entries) {
        syncService.push({
          type: "data-change-teamsApp",
          syncToTeamAppIdAllMembers: entry.id,
          operation: "update",
          data: [entry],
        });
      }
    });

    this.afterDelete(teamAppSelectAllZod.keyof().options, (entries) => {
      for (const entry of entries) {
        syncService.push({
          type: "data-change-teamsApp",
          syncToTeamAppIdAllMembers: entry.id,
          operation: "delete",
          data: [entry],
        });
      }
    });
  }
}