import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { promptSelectAllZod } from "@connected-repo/zod-schemas/prompt.zod";

export class PromptsTable extends BaseTable {
	readonly table = "prompts";

	columns = this.setColumns((t) => ({
		id: t.ulidWithDefault().primaryKey(),

		text: t.string(500),
		category: t.string(100).nullable(),
		tags: t.array(t.string()).nullable(),
		deletedAt: t.timestampNumber().nullable(),

		...t.timestamps(),
	}),
	(t) => [
		t.index([{column: "updatedAt", order: "DESC"}]),
	]);

	readonly softDelete = true;

	init() {
		this.afterCreate(promptSelectAllZod.keyof().options, (data) => {
			syncService.push({
				type: "data-change-prompts",
				operation: "create",
				data,
			});
		});
		this.afterUpdate(promptSelectAllZod.keyof().options, (data) => {
			syncService.push({
				type: "data-change-prompts",
				operation: "update",
				data,
			});
		});
		this.afterDelete(promptSelectAllZod.keyof().options, (data) => {
			syncService.push({
				type: "data-change-prompts",
				operation: "delete",
				data,
			});
		});
	}
}
