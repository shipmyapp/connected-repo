import { BaseTable } from "@backend/db/base_table";
import { Db } from "@backend/db/db";
import { syncService } from "@backend/modules/sync/sync.service";
import { fileSelectAllZod, FileSelectAll } from "@connected-repo/zod-schemas/file.zod";

const pushFilesToSync = (operation: "create" | "update" | "delete", files: FileSelectAll[]) => {
    const groups = new Map<string, FileSelectAll[]>();

    for (const file of files) {
        // Group by user and team to minimize frequency of sync pulses
        const key = `${file.tableName}:${file.createdByUserId}:${file.teamId || ""}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(file);
    }

    for (const [key, data] of groups.entries()) {
        const [tableName, userId, teamId] = key.split(":");
        if(tableName === "journalEntries"){
            syncService.push({
                data,
                operation,
                type: 'data-change-files',
                syncToUserId: userId as string,
                syncToTeamAppIdOwnersAdmins: teamId || null,
            });
        };
    }
};

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

    readonly softDelete = true;

    init(orm: Db) {
        this.afterCreate(fileSelectAllZod.keyof().options, async (files) => {
            pushFilesToSync("create", files);
        });
        this.afterUpdate(fileSelectAllZod.keyof().options, async (files) => {
            pushFilesToSync("update", files);
        });
        this.afterDelete(fileSelectAllZod.keyof().options, async (files) => {
            pushFilesToSync("delete", files);
        });
    }
}