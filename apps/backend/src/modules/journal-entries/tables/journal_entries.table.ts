import { BaseTable } from "@backend/db/base_table";
import { Db } from "@backend/db/db";
import { FileTable } from "@backend/modules/files/tables/files.table";
import { syncService } from "@backend/modules/sync/sync.service";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { JournalEntrySelectAll, journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";
import z from "zod";

// Notify sync service about journal entry changes
const pushEntriesToSync = (operation: "create" | "update" | "delete", entries: JournalEntrySelectAll[]) => {
    const groups = new Map<string, JournalEntrySelectAll[]>();

    for (const entry of entries) {
        // Group by author and team to minimize frequency of sync pulses
        const key = `${entry.authorUserId}:${entry.teamId || ""}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(entry);
    }

    for (const [key, data] of groups.entries()) {
        const [userId, teamAppId] = key.split(":");
        syncService.push({
            data,
            operation,
            type: 'data-change-journalEntries',
            syncToUserId: userId as string,
            syncToTeamAppIdOwnersAdmins: teamAppId || null,
        });
    }
};

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
			teamId: t.uuid().foreignKey("teams_app", "id", {
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
		this.afterCreate( journalEntrySelectAllZod.keyof().options, async (entries) => {
			pushEntriesToSync("create", entries);
		});
		this.afterUpdate( journalEntrySelectAllZod.keyof().options, async (entries) => {
			pushEntriesToSync("update", entries);
		});
		this.afterDelete( journalEntrySelectAllZod.keyof().options, async (entries) => {
			await orm.files.where({
				tableName: "journalEntries",
				type: "attachment",
				tableId: {
					in: entries.map((e) => e.id),
				}
			}).delete();
			pushEntriesToSync("delete", entries);
		});
	}
}
