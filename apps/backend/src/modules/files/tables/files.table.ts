import { BaseTable } from "@backend/db/base_table";

export class FileTable extends BaseTable {
	readonly table = "files";

	columns = this.setColumns((t) => ({
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
        teamId: t.ulid().foreignKey("teams_app", "id", {
            onDelete: "CASCADE",
            onUpdate: "RESTRICT",
        }).nullable(),
        deletedAt: t.timestampNumber().nullable(),

        ...t.timestamps()
	}));

    // Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
    readonly softDelete = true;
}