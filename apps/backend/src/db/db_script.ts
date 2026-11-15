import { BaseTable } from "@backend/db/base_table";
import { dbConfig } from "@backend/db/config.db.js";
import { rakeDb } from "orchid-orm/migrations/node-postgres";

export const change = rakeDb.run(dbConfig, {
	baseTable: BaseTable,
	dbPath: "./db",
	migrationId: "serial",
	migrationsPath: "./migrations",
	// `per-migration` wraps each migration file in its own transaction. Safer
	// rollback than the default per-statement mode when a single file makes
	// multiple coordinated DDL changes.
	transaction: "per-migration",
	commands: {
		async seed() {
			const { seed } = await import("./seed/index.js");
			const { db } = await import("./db.js");
			try {
				await seed();
			} finally {
				// The pool keeps warm connections for minutes (config.db.ts);
				// close it so the command exits when the seed is done.
				await db.$close();
			}
		},
	},
	import: (path) => import(path),
});
