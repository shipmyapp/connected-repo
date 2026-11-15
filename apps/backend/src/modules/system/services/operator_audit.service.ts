import { db } from "@backend/db/db";
import type { RpcAuthenticatedContext } from "@backend/procedures/protected.procedure";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import type {
	SuperAdminAuditListInput,
	SuperAdminAuditListOutput,
} from "@connected-repo/zod-schemas/super_admin.zod";

/** One console change, described for the audit trail. */
interface OperatorChange<T> {
	/** `<area>.<verb>`: "flags.set", "flags.delete", "users.revokeSessions". */
	action: string;
	/** What kind of thing changed: "flag", "user", "team". */
	targetKind: string;
	targetId: string | null;
	/** The operator's own words, when the console asks for them. */
	reason?: string | null;
	/** Reads the target as it is before the change (null: nothing there yet). */
	before: () => Promise<unknown>;
	/** Makes the change; its result is what the procedure returns. */
	apply: () => Promise<T>;
	/** What to record as the value after; the change's result when omitted. */
	after?: (result: T) => unknown;
}

/** JSON for the row: undefined and null both mean "nothing"; a bare value is wrapped. */
const toJson = (value: unknown): object | null => {
	if (value === undefined || value === null) return null;
	return typeof value === "object" ? value : { value };
};

/**
 * Every super-admin mutation goes through here. The value before, the
 * change and the audit row share one transaction: a change cannot commit
 * without its row, and a change that throws (refused, invalid, failed)
 * leaves no row. Who: the operator's id and email; from where: the client
 * IP as the backend reads it for every request.
 */
export async function withOperatorAudit<T>(
	context: Pick<RpcAuthenticatedContext, "user" | "reqHeaders">,
	change: OperatorChange<T>,
): Promise<T> {
	return await db.$transaction(async () => {
		const before = await change.before();
		const result = await change.apply();
		await db.operatorAuditLog.create({
			actorUserId: context.user.id,
			actorEmail: context.user.email ?? null,
			action: change.action,
			targetKind: change.targetKind,
			targetId: change.targetId,
			reason: change.reason ?? null,
			before: toJson(before),
			after: toJson(change.after ? change.after(result) : result),
			ipAddress: getClientIpAddress(context.reqHeaders),
		});
		return result;
	});
}

/** Newest first, optionally for one target; the filter is counted, only the page is ordered. */
export async function listOperatorAudit(
	input: SuperAdminAuditListInput,
): Promise<SuperAdminAuditListOutput> {
	let filtered = db.operatorAuditLog;
	if (input.targetKind) filtered = filtered.where({ targetKind: input.targetKind });
	if (input.targetId) filtered = filtered.where({ targetId: input.targetId });
	const [rows, total] = await Promise.all([
		filtered
			.select(
				"id",
				"actorUserId",
				"actorEmail",
				"action",
				"targetKind",
				"targetId",
				"before",
				"after",
				"reason",
				"ipAddress",
				"createdAt",
			)
			.order({ createdAt: "DESC", id: "DESC" })
			.limit(input.limit)
			.offset(input.offset),
		filtered.count(),
	]);
	return { rows, total: Number(total) };
}
