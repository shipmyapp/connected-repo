import { BaseTable } from "../../../db/base_table.js";
import { UserTeamsTable } from "../../user-teams/tables/user-teams.table.js";
import { UserTable } from "../../users/tables/users.table.js";

export class TeamMembersTable extends BaseTable {
	readonly table = "team_members";

	columns = this.setColumns((t) => ({
		teamMemberId: t.varchar(26).primaryKey(),
		userTeamId: t.varchar(26),
		userId: t.uuid().nullable(),
		email: t.string(),
		role: t.enum("role", ["owner", "admin", "user"]),
		joinedAt: t.timestampNumber().nullable(),
		...t.timestamps(),
	}), (t) => [
		t.unique(["userTeamId", "userId"]),
		t.unique(["userTeamId", "email"]),
	]);

	relations = {
		userTeam: this.belongsTo(() => UserTeamsTable, {
			columns: ["userTeamId"],
			references: ["userTeamId"],
		}),
		user: this.belongsTo(() => UserTable, {
			columns: ["userId"],
			references: ["id"],
		}),
	};
}
