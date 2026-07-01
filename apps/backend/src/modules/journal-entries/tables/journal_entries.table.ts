import { BaseTable } from "@backend/db/base_table";
import type { Db } from "@backend/db/db";
import { getRequestContext } from "@backend/lib/request-context";
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
			t.index(["authorUserId", { column: "updatedAt", order: "DESC" }]),
			// Cursor-pagination driver for sync pullBundles — covers
			// `WHERE team_id = $N AND updated_at < $X ORDER BY updated_at DESC, id DESC`.
			t.index(["teamId", "updatedAt", "id"]),
		],
	);

	// Default tenant scope — every query auto-filters by the current
	// request's teamId. Bypass with `.unscope('default')` for cross-tenant
	// reads (super-admin views, background reconciliation).
	// Returns unchanged query when no context exists (test setup, seed,
	// hook paths outside the request pipeline).
	scopes = this.setScopes({
		default: (q) => {
			const ctx = getRequestContext();
			return ctx ? q.where({ teamId: ctx.tenantTeamId }) : q;
		},
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
		this.afterDelete(
			journalEntrySelectAllZod.keyof().options,
			async (entries) => {
				await orm.files
					.where({
						tableName: "journalEntries",
						type: "attachment",
						tableId: {
							in: entries.map((e) => e.id),
						},
					})
					.delete();
			},
		);
	}
}
