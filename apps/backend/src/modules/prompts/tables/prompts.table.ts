import { BaseTable } from "@backend/db/base_table";
import { syncService } from "@backend/modules/sync/sync.service";
import { promptSelectAllZod } from "@connected-repo/zod-schemas/prompt.zod";

export class PromptTable extends BaseTable {
	readonly table = "prompts";

	columns = this.setColumns((t) => ({
		promptId: t.smallint().identity().primaryKey(),

		text: t.string(500),
		category: t.string(100).nullable(),
		tags: t.array(t.string()).nullable(),
		isActive: t.boolean().default(true),

		deletedAt: t.deletedAt(),
		...t.timestamps(),
	}),
	(t) => [
		t.index([{ column: "updatedAt", order: "DESC" }]),
		t.index([{ column: "deletedAt", order: "DESC" }]),
	]);

	readonly softDelete = true;

	init() {
		this.afterCreateCommit(promptSelectAllZod.keyof().options, (prompts) => {
			syncService.push({
				type: 'prompts',
				operation: 'create',
				data: prompts,
			})
		}),
		this.afterUpdateCommit(promptSelectAllZod.keyof().options, (prompts) => {
			syncService.push({
				type: 'prompts',
				operation: 'update',
				data: prompts,
			})
		}),
		this.afterDeleteCommit(promptSelectAllZod.keyof().options, (prompts) => {
			syncService.push({
				type: 'prompts',
				operation: 'delete',
				data: prompts,
			})
		})
	}
}
