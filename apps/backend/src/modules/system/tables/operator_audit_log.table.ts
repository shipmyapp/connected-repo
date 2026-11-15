import { BaseTable } from "@backend/db/base_table";

/**
 * Every change an operator made from the super-admin console. Append-only:
 * written by `withOperatorAudit` (operator_audit.service.ts) in the same
 * transaction as the change, never updated or deleted by the app. Not
 * tenant data (operators act across teams), not synced. No foreign key to
 * users: a row outlives the operator's account, and `actorEmail` keeps who
 * it was.
 */
export class OperatorAuditLogTable extends BaseTable {
	readonly table = "operator_audit_log";

	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			actorUserId: t.uuid(),
			actorEmail: t.string(320).nullable(),
			action: t.string(100),
			targetKind: t.string(40),
			targetId: t.string(100).nullable(),
			before: t.json<object>().nullable(),
			after: t.json<object>().nullable(),
			reason: t.string(300).nullable(),
			ipAddress: t.string(64).nullable(),
			...t.timestampsAsNumbers(),
		}),
		(t) => [
			t.index([{ column: "createdAt", order: "DESC" }]),
			t.index(["targetKind", "targetId"]),
			t.index(["actorUserId", { column: "createdAt", order: "DESC" }]),
		],
	);
}
