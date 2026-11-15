import { change } from "../db_script";

// files.getByTableId reads a parent's files by (table_name, table_id); no
// index served it. Declared on FileTable as well.
change(async (db) => {
	await db.addIndex("files", ["tableName", "tableId"], {
		name: "files_table_name_table_id_idx",
	});
});
