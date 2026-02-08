import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { JournalEntrySelectAll, journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";

const groupByUserIdAndPush = (operation: "create" | "update" | "delete", entries: JournalEntrySelectAll[] ) => {
	const groupedByUserId = new Map<string, JournalEntrySelectAll[]>();
	for(const entry of entries){
		if(!groupedByUserId.has(entry.authorUserId)){
			groupedByUserId.set(entry.authorUserId, []);
		}
		groupedByUserId.get(entry.authorUserId)!.push(entry);
	}
	
	for(const [userId, data] of groupedByUserId.entries()){
		syncService.push({
			data,
			operation,
			type: 'data-change-journalEntries',
			userId,
		})
	}
};

export class JournalEntryTable extends BaseTable {
	readonly table = "journal_entries";

	columns = this.setColumns((t) => 
		({
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
			attachmentUrls: t.array(t.array(t.string()).narrowType(t => t<[string, string]>())).default([]),
			deletedAt: t.timestampNumber().nullable(),

			...t.timestamps(),
		}),
		(t) => [
			t.index(["authorUserId", {column: "updatedAt", order: "DESC"}])
		]
	);

	readonly softDelete = true;

	relations = {
		author: this.belongsTo(() => UserTable, {
			columns: ["authorUserId"],
			references: ["id"],
		})
	};

	init() {
		this.afterCreate( journalEntrySelectAllZod.keyof().options, (entries) => {
			groupByUserIdAndPush("create", entries);
		});
		this.afterUpdate( journalEntrySelectAllZod.keyof().options, (entries) => {
			groupByUserIdAndPush("update", entries);
		});
		this.afterDelete( journalEntrySelectAllZod.keyof().options, (entries) => {
			groupByUserIdAndPush("delete", entries);
		});
	}
}
