import { BaseTable } from "@backend/db/base_table";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { TeamAppTable } from "./teams_app.table";

export class TeamMemberTable extends BaseTable {
  readonly table = "team_members";

  columns = this.setColumns((t) => ({
    id: t.ulidWithDefault().primaryKey(),
    teamId: t.ulid().foreignKey("teams_app", "id", {
        onUpdate: "RESTRICT",
        onDelete: "CASCADE",
    }),
    userId: t.uuid().foreignKey("users", "id", {
        onUpdate: "RESTRICT",
        onDelete: "SET NULL",
    }).nullable(),
    email: t.string().nullable(),
    phoneNumber: t.string().nullable(),
    role: t.teamMemberRoleEnum(),
    addedAt: t.timestampNumber().default(t.sql`NOW()`),
    joinedAt: t.timestampNumber().nullable(),
    deletedAt: t.timestampNumber().nullable(),

    ...t.timestamps(),
  }));

  // Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
  readonly softDelete = true;

  relations = {
    team: this.belongsTo(() => TeamAppTable, {
      columns: ["teamId"],
      references: ["id"],
    }),
    user: this.belongsTo(() => UserTable, {
      columns: ["userId"],
      references: ["id"],
    }),
  }
}