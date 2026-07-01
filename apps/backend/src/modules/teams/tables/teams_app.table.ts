import { BaseTable } from "@backend/db/base_table";
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
}