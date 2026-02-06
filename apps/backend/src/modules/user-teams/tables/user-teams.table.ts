import { BaseTable } from "../../../db/base_table.js";

export class UserTeamsTable extends BaseTable {
	readonly table = "user_teams";

	columns = this.setColumns((t) => ({
		userTeamId: t.varchar(26).primaryKey(),
		name: t.string(),
		logoUrl: t.string().nullable(),
		createdByUserId: t.uuid(),
		...t.timestamps(),
		deletedAt: t.timestampNumber().nullable(),
	}));

	relations = {
		createdBy: this.belongsTo(() => UserTable, {
			columns: ["createdByUserId"],
			references: ["id"],
		}),
		members: this.hasMany(() => TeamMembersTable, {
			columns: ["userTeamId"],
			references: ["userTeamId"],
		}),
		leads: this.hasMany(() => LeadTable, {
			columns: ["userTeamId"],
			references: ["userTeamId"],
		}),
	};
}

// Import dependencies
import { UserTable } from "../../users/tables/users.table.js";
import { TeamMembersTable } from "../../team-members/tables/team-members.table.js";
import { LeadTable } from "../../leads/tables/leads.table.js";
