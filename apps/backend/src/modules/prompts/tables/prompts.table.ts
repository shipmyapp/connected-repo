import { BaseTable } from "@backend/db/base_table";

export class PromptsTable extends BaseTable {
	readonly table = "prompts";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),

			text: t.string(500),
			category: t.string(100).nullable(),
			tags: t.array(t.string()).nullable(),
			deletedAt: t.timestampNumber().nullable(),

			...t.timestamps(),
		}),
		(t) => [t.index([{ column: "updatedAt", order: "DESC" }])],
	);

	// Disable soft delete during non-E2E tests to avoid SQL syntax errors when using onConflictDoNothing()
	readonly softDelete = true;
}
