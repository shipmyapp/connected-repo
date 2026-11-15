import { db } from "@backend/db/db";
import type { Asks, RecordAskInput } from "@connected-repo/zod-schemas/device.zod";
import { nextAskState } from "@connected-repo/zod-schemas/devices/asks.rules";

/** The person's answers to the device asks. */
export const asksOf = async (userId: string): Promise<Asks> => {
	const { asks } = await db.users.find(userId).select("asks");
	return asks ?? {};
};

/**
 * One answer to a device ask: Not now climbs the snooze ladder,
 * a grant clears it, a browser refusal quiets it for a month, an awaited
 * install is noted. Kept on the account so every device agrees.
 */
export const recordAsk = async (
	userId: string,
	{ kind, outcome }: RecordAskInput,
	now = Date.now(),
): Promise<Asks> => {
	// Read and written under the row lock: two answers at once both count.
	return db.$transaction(async () => {
		const { asks: current } = await db.users.find(userId).forUpdate().select("asks");
		const asks = current ?? {};
		const next: Asks = { ...asks, [kind]: nextAskState(asks[kind], outcome, now) };
		await db.users.find(userId).update({ asks: next });
		return next;
	});
};
