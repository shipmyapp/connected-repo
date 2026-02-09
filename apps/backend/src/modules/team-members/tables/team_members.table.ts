import { BaseTable } from "@backend/db/base_table";
import { UserTable } from "../../users/tables/users.table";
import { TeamTable } from "../../teams/tables/teams.table";

export class TeamMembersTable extends BaseTable {
  readonly table = "team_members";

  columns = this.setColumns((t) => ({
    teamMemberId: t.ulid().primaryKey(),
    teamId: t.uuid().foreignKey("teams", "teamId", {
      onDelete: "CASCADE",
      onUpdate: "RESTRICT",
    }),
    userId: t.uuid().foreignKey("users", "id", {
      onDelete: "CASCADE",
      onUpdate: "RESTRICT",
    }).nullable(),
    email: t.string(),
    role: t.enum("role", ["owner", "admin", "user"]),
    joinedAt: t.timestampNumber().nullable(),
    ...t.timestamps(),
  }), (t) => [
    t.unique(["teamId", "userId"]),
    t.unique(["teamId", "email"]),
  ]);

  relations = {
    team: this.belongsTo(() => TeamTable, {
      columns: ["teamId"],
      references: ["teamId"],
    }),
    user: this.belongsTo(() => UserTable, {
      columns: ["userId"],
      references: ["id"],
    }),
  };
}
