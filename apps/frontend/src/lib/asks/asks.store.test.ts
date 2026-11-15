// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const profile = vi.fn();
const recordAsk = vi.fn();
vi.mock("@frontend/utils/orpc.client", () => ({
	orpcFetch: {
		me: {
			asks: (...args: unknown[]) => profile(...args),
			recordAsk: (...args: unknown[]) => recordAsk(...args),
		},
	},
}));

const here = vi.fn();
vi.mock("@frontend/lib/device/use-device-here", () => ({ fetchDeviceHere: () => here() }));

const load = async () => {
	vi.resetModules();
	return import("./asks.store");
};

beforeEach(() => {
	profile.mockReset();
	recordAsk.mockReset();
	here.mockReset();
	here.mockResolvedValue(null);
});

describe("the ask store", () => {
	it("reads the account's answers once, asks at most once a visit, and keeps Not now for a while", async () => {
		profile.mockResolvedValue({ install: { snoozedUntil: Date.now() + 1000 } });
		recordAsk.mockImplementation(async ({ kind }: { kind: string }) => ({
			asks: { [kind]: { snoozes: 1, snoozedUntil: Date.now() + 5000 } },
		}));
		const { mayAskNow, useAsksStore } = await load();
		expect(await mayAskNow("push")).toBe(true);
		expect(await mayAskNow("install")).toBe(false);
		expect(profile).toHaveBeenCalledTimes(1);

		await useAsksStore.getState().record("push", "snoozed");
		expect(recordAsk).toHaveBeenCalledWith({ kind: "push", outcome: "snoozed" });
		expect(await mayAskNow("push")).toBe(false);
	});

	it("asks as if never asked when the account cannot be read, and starts clean after sign-out", async () => {
		profile.mockRejectedValue(new Error("offline"));
		recordAsk.mockRejectedValue(new Error("offline"));
		const { mayAskNow, useAsksStore } = await load();
		expect(await mayAskNow("push")).toBe(true);
		await useAsksStore.getState().record("push", "snoozed");
		// Kept for this visit even though the account was not told.
		expect(await mayAskNow("push")).toBe(false);
		useAsksStore.getState().reset();
		profile.mockResolvedValue({});
		expect(await mayAskNow("push")).toBe(true);
	});

	it("takes granted from this device, not from the account", async () => {
		// The account said yes to push on another phone: this one is still asked.
		profile.mockResolvedValue({ push: { grantedAt: Date.now() - 1000 } });
		here.mockResolvedValue({ pushHere: false, installedHere: true });
		const { mayAskNow } = await load();
		expect(await mayAskNow("push")).toBe(true);
		expect(await mayAskNow("install")).toBe(false);
		here.mockResolvedValue({ pushHere: true, installedHere: false });
		expect(await mayAskNow("push")).toBe(false);
	});
});
