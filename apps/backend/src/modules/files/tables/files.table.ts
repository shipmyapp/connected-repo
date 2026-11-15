import { BaseTable } from "@backend/db/base_table";
import { getRequestContext, tenantTeamIdOrThrow } from "@backend/lib/request-context";

export class FileTable extends BaseTable {
	readonly table = "files";

	columns = this.setColumns(
		(t) => ({
			id: t.ulid().primaryKey(),
			tableName: t.fileTableNameEnum(),
			tableId: t.string(),
			type: t.fileTypeEnum(),

			fileName: t.string(),
			mimeType: t.string(),
			cdnUrl: t.string().nullable(),
			thumbnailCdnUrl: t.string().nullable(),
			isMainFileLost: t.boolean().default(false),

			createdByUserId: t.uuid().foreignKey("users", "id", {
				onDelete: "CASCADE",
				onUpdate: "RESTRICT",
			}),
			// Auto-stamped from AsyncLocalStorage on insert. See journal_entries
			// for the design note.
			teamId: t
				.ulid()
				.foreignKey("teams_app", "id", {
					onDelete: "CASCADE",
					onUpdate: "RESTRICT",
				})
				.nullable()
				.setOnCreate(() => getRequestContext()?.tenantTeamId ?? null),
			deletedAt: t.timestampNumber().nullable(),

			...t.timestamps(),
		}),
		(t) => [
			// Cursor-pagination driver for files pullBundles.
			t.index(["teamId", { column: "updatedAt", order: "DESC" }, { column: "id", order: "DESC" }], {
				name: "files_sync_delta_idx",
			}),
			// Look-up index for the parent-scoped fetch pattern
			// (files.getByTableId).
			t.index(["tableName", "tableId"], { name: "files_table_name_table_id_idx" }),
		],
	);

	// Default tenant scope: the request's team. Fails closed: a query with no
	// team request context throws instead of reading every team. Lift it with
	// `.unscope("default")` where a cross-team query is meant. Inserts are
	// not scoped.
	scopes = this.setScopes({
		default: (q) => q.where({ teamId: tenantTeamIdOrThrow("files") }),
	});

	// Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
	readonly softDelete = true;
}
