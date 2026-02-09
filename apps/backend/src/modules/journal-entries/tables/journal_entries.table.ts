import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { JournalEntrySelectAll, journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";

const pushToRelevantUsers = async (operation: "create" | "update" | "delete", entries: JournalEntrySelectAll[]) => {
	const { db } = await import("../../../db/db.js");
	const groupedByUserId = new Map<string, JournalEntrySelectAll[]>();

	const addEntryForUser = (userId: string, entry: JournalEntrySelectAll) => {
		if (!groupedByUserId.has(userId)) {
			groupedByUserId.set(userId, []);
		}
		groupedByUserId.get(userId)!.push(entry);
	};

	const teamIds = [...new Set(entries.map((e: any) => e.teamId).filter(Boolean) as string[])];
	const teamMembersMap = new Map<string, string[]>();

	if (teamIds.length > 0) {
		const members = await db.teamMembers.where({ teamId: { in: teamIds } }).select("teamId", "userId");
		for (const member of members) {
			if (member.userId) {
				if (!teamMembersMap.has(member.teamId)) {
					teamMembersMap.set(member.teamId, []);
				}
				teamMembersMap.get(member.teamId)!.push(member.userId);
			}
		}
	}

	for (const entry of entries) {
		const entryAsAny = entry as any;
		if (entryAsAny.teamId && teamMembersMap.has(entryAsAny.teamId)) {
			const members = teamMembersMap.get(entryAsAny.teamId)!;
			for (const userId of members) {
				addEntryForUser(userId, entry);
			}
		} else {
			addEntryForUser(entry.authorUserId, entry);
		}
	}

	for (const [userId, data] of groupedByUserId.entries()) {
		syncService.push({
			data,
			operation,
			type: "data-change-journalEntries",
			userId,
		});
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
			teamId: t.uuid().foreignKey("teams", "teamId", {
				onDelete: "CASCADE",
				onUpdate: "RESTRICT",
			}).nullable(),
			attachmentUrls: t.array(t.array(t.string()).narrowType(t => t<[string, "not-available" | string]>())).default([]),
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
		this.afterCreate(journalEntrySelectAllZod.keyof().options, (entries) => {
			pushToRelevantUsers("create", entries);
		});
		this.afterUpdate(journalEntrySelectAllZod.keyof().options, (entries) => {
			pushToRelevantUsers("update", entries);
		});
		this.afterDelete(journalEntrySelectAllZod.keyof().options, (entries) => {
			pushToRelevantUsers("delete", entries);
		});
	}
}
