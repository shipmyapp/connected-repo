import { env } from "@backend/configs/env.config.js";
import { BaseTable } from "@backend/db/base_table";
import { dbConfig } from "@backend/db/config.db.js";
import { rakeDb } from "orchid-orm/migrations/node-postgres";

export const change = rakeDb.run(dbConfig, {
	baseTable: BaseTable,
	dbPath: "./db",
	migrationId: "serial",
	migrationsPath: "./migrations",
	// schema: env.DB_SCHEMA,
	commands: {
		async seed() {
			const { seed } = await import("./seed/index.js");
			await seed();
		},
	},
	import: (path) => import(path),
	//   beforeMigrate?(db: Db): Promise<void>;
	//   afterMigrate?(db: Db): Promise<void>;
	//   beforeRollback?(db: Db): Promise<void>;
	//   afterRollback?(db: Db): Promise<void>;
});
