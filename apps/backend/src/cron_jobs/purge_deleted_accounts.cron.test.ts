import { db } from "@backend/db/db";
import { defaultContext } from "@backend/test/setup";
import { createUserAndLogin } from "@backend/test/utils/user-auth.utils";
import { describe, expect, it, vi } from "vitest";
import { purgeDeletedAccountsTick } from "./purge_deleted_accounts.cron";

const failFor = vi.hoisted(() => new Set<string>());

// Real blockers, except for the accounts listed: their purge fails with a
// database error, which aborts the transaction it runs in.
vi.mock("@backend/modules/users/services/deletion.users.service", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@backend/modules/users/services/deletion.users.service")>();
	return {
		...original,
		findDeletionBlockers: async (userId: string) => {
			if (failFor.has(userId)) {
				const { db: database } = await import("@backend/db/db.js");
				await database.$query`SELECT 1 / 0`;
			}
			return original.findDeletionBlockers(userId);
		},
	};
});

const DAY_MS = 86_400_000;

describe("purgeDeletedAccountsTick", () => {
	it("purges due accounts; one failing account does not stop the others", async () => {
		if (!defaultContext) throw new Error("test context missing");
		const now = Date.now();
		const ok = defaultContext;
		const failing = await createUserAndLogin();
		const notDue = await createUserAndLogin();
		await db.users.find(ok.user.id).update({ deletionRequestedAt: now - 31 * DAY_MS });
		await db.users.find(failing.user.id).update({ deletionRequestedAt: now - 32 * DAY_MS });
		await db.users.find(notDue.user.id).update({ deletionRequestedAt: now - 5 * DAY_MS });
		failFor.add(failing.user.id);
		await db.erasedDeviceKeys.create({ deviceKey: "old".padEnd(22, "x") });
		await db.erasedDeviceKeys
			.where({ deviceKey: "old".padEnd(22, "x") })
			.update({ createdAt: now - 401 * DAY_MS });

		const counts = await purgeDeletedAccountsTick(now);

		expect(counts).toEqual({ purged: 1, blocked: 0, failed: 1 });
		expect(await db.users.findOptional(ok.user.id)).toBeUndefined();
		expect(await db.users.findOptional(failing.user.id)).toBeDefined();
		expect(await db.users.findOptional(notDue.user.id)).toBeDefined();
		expect(await db.erasedDeviceKeys.where({ deviceKey: "old".padEnd(22, "x") }).exists()).toBe(
			false,
		);
		failFor.clear();
	});
});
