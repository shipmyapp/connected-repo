import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { JournalEntrySelectAll, journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";

const groupByUserIdAndPush = (journalEntries: JournalEntrySelectAll[], operation: 'create' | 'update' | 'delete') => {
	const groupedByUserId = new Map<string, JournalEntrySelectAll[]>();
	for(const journalEntry of journalEntries){
		if(!groupedByUserId.has(journalEntry.authorUserId)){
			groupedByUserId.set(journalEntry.authorUserId, []);
		}
		groupedByUserId.get(journalEntry.authorUserId)!.push(journalEntry);
	}
	
	for(const [userId, data] of groupedByUserId.entries()){
		syncService.push({
			data,
			operation,
			type: 'journalEntries',
			userId,
		})
	}
}

export class JournalEntryTable extends BaseTable {
	readonly table = "journal_entries";

	columns = this.setColumns((t) => ({
		journalEntryId: t.ulid().primaryKey(),

		prompt: t.string(500).nullable(),
		promptId: t.smallint().foreignKey("prompts", "promptId", {
			onDelete: "SET NULL",
			onUpdate: "RESTRICT",
		}).nullable(),
		content: t.text(),
		authorUserId: t.uuid().foreignKey("users", "id", {
			onDelete: "CASCADE",
			onUpdate: "RESTRICT",
		}),

		deletedAt: t.deletedAt(),
		...t.timestamps(),
	}),
	(t) => [
		t.index(["authorUserId", { column: "updatedAt", order: "DESC" }]),
		t.index([{column: "deletedAt", order: "DESC"}]),
	]);

	readonly softDelete = true;

	init() {
		this.afterCreateCommit(journalEntrySelectAllZod.keyof().options, (journalEntries) => {
			groupByUserIdAndPush(journalEntries, 'create');
		})
		this.afterUpdateCommit(journalEntrySelectAllZod.keyof().options, (journalEntries) => {
			groupByUserIdAndPush(journalEntries, 'update');
		})
		this.afterDeleteCommit(journalEntrySelectAllZod.keyof().options, (journalEntries) => {
			groupByUserIdAndPush(journalEntries, 'delete');
		})
	}

	relations = {
		author: this.belongsTo(() => UserTable, {
			columns: ["authorUserId"],
			references: ["id"],
		})
	};
}
