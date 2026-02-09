import { BaseTable } from "@backend/db/base_table";
import { UserTable } from "../../users/tables/users.table";

export class TeamTable extends BaseTable {
  readonly table = "teams";

  columns = this.setColumns((t) => ({
    teamId: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
    name: t.string(),
    logoUrl: t.string().nullable(),
    createdByUserId: t.uuid().foreignKey("users", "id", {
      onDelete: "CASCADE",
      onUpdate: "RESTRICT",
    }),
    ...t.timestamps(),
  }));

  relations = {
    createdBy: this.belongsTo(() => UserTable, {
      columns: ["createdByUserId"],
      references: ["id"],
    }),
    members: this.hasMany(() => TeamMembersTable, {
      columns: ["teamId"],
      references: ["teamId"],
    }),
  };
}

import { TeamMembersTable } from "../../team-members/tables/team_members.table";
