import { BaseTable } from "@backend/db/base_table";

/**
 * What a connected app changed for a person (ADR-045): one row per tool call
 * that changed something, written by `define_tool`. The profile's "Connected
 * apps" counts and lists them. No foreign key to the app or the team: the
 * record outlives both. Not synced to devices.
 */
export class ConnectedAppActionTable extends BaseTable {
	readonly table = "connected_app_actions";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			userId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			clientId: t.text(),
			teamId: t.ulid().nullable(),
			tool: t.text(),
			what: t.text(),
			request: t.text().nullable(),
			entityTable: t.text().nullable(),
			entityId: t.text().nullable(),
			...t.timestampsAsNumbers(),
		}),
		(t) => [
			t.index(["userId", "clientId", { column: "createdAt", order: "DESC" }], {
				name: "connected_app_actions_user_client_created_idx",
			}),
		],
	);
}
