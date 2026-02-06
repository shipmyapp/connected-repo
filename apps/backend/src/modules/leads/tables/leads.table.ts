import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { TeamTable } from "@backend/modules/teams/tables/teams.table";
import { LeadSelectAll, leadSelectAllZod } from "@connected-repo/zod-schemas/leads.zod";

const groupByUserIdAndPush = (leads: LeadSelectAll[], operation: 'create' | 'update' | 'delete' ) => {
	const groupedByUserId = new Map<string, LeadSelectAll[]>();
	for(const lead of leads){
		if(!groupedByUserId.has(lead.capturedByUserId)){
			groupedByUserId.set(lead.capturedByUserId, []);
		}
		groupedByUserId.get(lead.capturedByUserId)!.push(lead);
	}
	
	for(const [userId, data] of groupedByUserId.entries()){
		syncService.push({
			data,
			operation,
			type: 'leads',
			userId,
		})
	}
}

export class LeadTable extends BaseTable {
	readonly table = "leads";

	columns = this.setColumns((t) => ({
		leadId: t.ulid().primaryKey(),

		contactName: t.string(255),
		companyName: t.string(255).nullable(),
		jobTitle: t.string(255).nullable(),
		email: t.string(255).nullable(),
		phone: t.string(15).nullable(),
		website: t.string(255).nullable(),
		address: t.text().nullable(),
		notes: t.text().nullable(),
		
		capturedByUserId: t.uuid().foreignKey("users", "id", {
			onDelete: "CASCADE",
			onUpdate: "RESTRICT",
		}),
		teamId: t.uuid().foreignKey("teams", "teamId", {
			onDelete: "CASCADE",
			onUpdate: "RESTRICT",
		}).nullable(),

		deletedAt: t.deletedAt(),
		...t.timestamps(),
	}),
	(t) => [
		t.index(["capturedByUserId", { column: "updatedAt", order: "DESC" }]),
		t.index(["teamId", { column: "updatedAt", order: "DESC" }]),
		t.index([{column: "deletedAt", order: "DESC"}]),
	]);

	readonly softDelete = true;

	init() {
		this.afterCreateCommit(leadSelectAllZod.keyof().options, (leads) => {
			groupByUserIdAndPush(leads, 'create');
		})
		this.afterUpdateCommit(leadSelectAllZod.keyof().options, (leads) => {
			groupByUserIdAndPush(leads, 'update');
		})
		this.afterDeleteCommit(leadSelectAllZod.keyof().options, (leads) => {
			groupByUserIdAndPush(leads, 'delete');
		})
	}

	relations = {
		capturedBy: this.belongsTo(() => UserTable, {
			columns: ["capturedByUserId"],
			references: ["id"],
		}),
		team: this.belongsTo(() => TeamTable, {
			columns: ["teamId"],
			references: ["teamId"],
		})
	};
}
