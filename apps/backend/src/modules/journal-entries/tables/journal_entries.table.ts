
import { BaseTable } from "@backend/db/base_table";
import type { Db } from "@backend/db/db";
import { FileTable } from "@backend/modules/files/tables/files.table";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";

export class JournalEntryTable extends BaseTable {
	readonly table = "journal_entries";

	columns = this.setColumns((t) => 
		({
			id: t.ulidWithDefault().primaryKey(),

			prompt: t.string(500).nullable(),
			promptId: t.ulid().foreignKey("prompts", "id", {
				onDelete: "SET NULL",
				onUpdate: "RESTRICT",
			}).nullable(),
			content: t.text(),
			authorUserId: t.uuid().foreignKey("users", "id", {
				onDelete: "CASCADE",
				onUpdate: "RESTRICT",
			}),
			teamId: t.ulid().foreignKey("teams_app", "id", {
				onDelete: "SET NULL",
				onUpdate: "RESTRICT",
			}).nullable(),
			deletedAt: t.timestampNumber().nullable(),

			...t.timestamps(),
		}),
		(t) => [
			t.index(["authorUserId", {column: "updatedAt", order: "DESC"}])
		]
	);

	// Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
	readonly softDelete = true;

	relations = {
		attachments: this.hasMany(() => FileTable, {
			columns: ["id"],
			references: ["tableId"],
			on: {
				tableName: "journalEntries" as const,
				type: "attachment" as const,
			}
		}),
		author: this.belongsTo(() => UserTable, {
			columns: ["authorUserId"],
			references: ["id"],
		})
	};

	init(orm: Db) {
		this.afterDelete(journalEntrySelectAllZod.keyof().options, async (entries) => {
			await orm.files.where({
				tableName: "journalEntries",
				type: "attachment",
				tableId: {
					in: entries.map((e) => e.id),
				}
			}).delete();
		});
	}
}
