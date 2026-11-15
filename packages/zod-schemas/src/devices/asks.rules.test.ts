import { describe, expect, it } from "vitest";
import { ASK_SNOOZE_DAYS, isAskSnoozed, mayAsk, nextAskState, snoozeDaysFor } from "./asks.rules";

const DAY = 24 * 60 * 60 * 1000;

describe("device asks", () => {
	it("climbs the ladder 3, 7, 14, 30 days and stays at 30", () => {
		expect(ASK_SNOOZE_DAYS).toEqual([3, 7, 14, 30]);
		expect([0, 1, 2, 3, 9].map(snoozeDaysFor)).toEqual([3, 7, 14, 30, 30]);
		let state = nextAskState(undefined, "snoozed", 0);
		expect(state).toEqual({ snoozes: 1, snoozedUntil: 3 * DAY });
		state = nextAskState(state, "snoozed", 3 * DAY);
		expect(state.snoozedUntil).toBe(10 * DAY);
		state = nextAskState(state, "snoozed", 10 * DAY);
		expect(state.snoozedUntil).toBe(24 * DAY);
		state = nextAskState(state, "snoozed", 24 * DAY);
		expect(state.snoozedUntil).toBe(54 * DAY);
		state = nextAskState(state, "snoozed", 54 * DAY);
		expect(state.snoozedUntil).toBe(84 * DAY);
	});

	it("asks again once the time is up, never twice a visit, and not once granted", () => {
		const snoozed = nextAskState(undefined, "snoozed", 0);
		expect(isAskSnoozed(snoozed, DAY)).toBe(true);
		expect(mayAsk(snoozed, DAY, false, false)).toBe(false);
		expect(mayAsk(snoozed, 3 * DAY + 1, false, false)).toBe(true);
		expect(mayAsk(snoozed, 3 * DAY + 1, true, false)).toBe(false);
		expect(mayAsk(undefined, 0, false, false)).toBe(true);
		// Granted on this device: nothing to ask here.
		expect(mayAsk(undefined, 0, false, true)).toBe(false);
		// Granted on another phone of the account: this one is still asked.
		expect(mayAsk(nextAskState(snoozed, "granted", 5 * DAY), 100 * DAY, false, false)).toBe(true);
	});

	it("keeps a browser refusal quiet for a month and remembers an install that is pending", () => {
		const denied = nextAskState(undefined, "denied", 0);
		expect(denied).toEqual({ deniedAt: 0, snoozedUntil: 30 * DAY });
		const pending = nextAskState(undefined, "pending_install", 7);
		expect(pending.pendingInstallSince).toBe(7);
		const granted = nextAskState({ ...pending, snoozedUntil: 99, snoozes: 2 }, "granted", 8);
		expect(granted).toEqual({ snoozes: 2, grantedAt: 8 });
	});
});
