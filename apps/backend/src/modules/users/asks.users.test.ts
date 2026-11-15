import { db } from "@backend/db/db";
import { meRouter } from "@backend/modules/users/me.user_app.router";
import { defaultContext } from "@backend/test/setup";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

const DAY = 24 * 60 * 60 * 1000;

describe("me.recordAsk", () => {
	it("keeps each ask's answers on the account: Not now climbs the ladder, a grant clears it", async () => {
		if (!defaultContext) throw new Error("defaultContext not initialized");
		const me = createRouterClient(meRouter, { context: defaultContext });
		expect(await me.asks()).toEqual({});
		const before = Date.now();
		const first = (await me.recordAsk({ kind: "push", outcome: "snoozed" })).asks;
		expect(first.push?.snoozes).toBe(1);
		expect(first.push?.snoozedUntil).toBeGreaterThanOrEqual(before + 3 * DAY);
		const second = (await me.recordAsk({ kind: "push", outcome: "snoozed" })).asks;
		expect(second.push?.snoozedUntil).toBeGreaterThanOrEqual(before + 7 * DAY);
		const install = (await me.recordAsk({ kind: "install", outcome: "denied" })).asks;
		expect(install.push?.snoozes).toBe(2);
		const granted = (await me.recordAsk({ kind: "push", outcome: "granted" })).asks;
		expect(granted.push?.snoozedUntil).toBeUndefined();
		expect(granted.push?.grantedAt).toBeGreaterThanOrEqual(before);
		const { asks } = await db.users.find(defaultContext.user.id).select("asks");
		expect(asks.install?.deniedAt).toBeGreaterThanOrEqual(before);
		expect(await me.asks()).toEqual(asks);
	});
});
