import { BaseTable } from "@backend/db/base_table";
import type { Db } from "@backend/db/db";
import { getRequestContext, tenantTeamIdOrThrow } from "@backend/lib/request-context";
import { FileTable } from "@backend/modules/files/tables/files.table";
import { UserTable } from "@backend/modules/users/tables/users.table";
import { journalEntrySelectAllZod } from "@connected-repo/zod-schemas/journal_entry.zod";

export class JournalEntryTable extends BaseTable {
	readonly table = "journal_entries";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),

			prompt: t.string(500).nullable(),
			promptId: t
				.ulid()
				.foreignKey("prompts", "id", {
					onDelete: "SET NULL",
					onUpdate: "RESTRICT",
				})
				.nullable(),
			content: t.text(),
			authorUserId: t.uuid().foreignKey("users", "id", {
				onDelete: "CASCADE",
				onUpdate: "RESTRICT",
			}),
			// Auto-stamped from AsyncLocalStorage on insert — mirrors the
			// write-side of the default scope so create-then-read via the
			// factory pattern is symmetric. Left nullable to preserve the
			// pre-tenancy API contract for callers running outside a
			// request context (seed, background reconciliation).
			teamId: t
				.ulid()
				.foreignKey("teams_app", "id", {
					onDelete: "SET NULL",
					onUpdate: "RESTRICT",
				})
				.nullable()
				.setOnCreate(() => getRequestContext()?.tenantTeamId ?? null),
			deletedAt: t.timestampNumber().nullable(),

			...t.timestamps(),
		}),
		(t) => [
			t.index(["authorUserId", { column: "updatedAt", order: "DESC" }], {
				name: "journal_entries_author_user_id_updated_at_idx",
			}),
			// Cursor-pagination driver for sync pullBundles — covers
			// `WHERE team_id = $N AND updated_at < $X ORDER BY updated_at DESC, id DESC`.
			t.index(["teamId", { column: "updatedAt", order: "DESC" }, { column: "id", order: "DESC" }], {
				name: "journal_entries_sync_delta_idx",
			}),
		],
	);

	// Default tenant scope: the request's team. Fails closed: a query with no
	// team request context throws instead of reading every team. Lift it with
	// `.unscope("default")` where a cross-team query is meant. Inserts are
	// not scoped.
	scopes = this.setScopes({
		default: (q) => q.where({ teamId: tenantTeamIdOrThrow("journal_entries") }),
	});

	// Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
	readonly softDelete = true;

	relations = {
		files: this.hasMany(() => FileTable, {
			columns: ["id"],
			references: ["tableId"],
			on: {
				tableName: "journalEntries" as const,
				type: "attachment" as const,
			},
		}),
		author: this.belongsTo(() => UserTable, {
			columns: ["authorUserId"],
			references: ["id"],
		}),
	};

	init(orm: Db) {
		this.afterDelete(journalEntrySelectAllZod.keyof().options, async (entries) => {
			await orm.files
				.where({
					tableName: "journalEntries",
					type: "attachment",
					tableId: {
						in: entries.map((e) => e.id),
					},
				})
				.delete();
		});
	}
}
