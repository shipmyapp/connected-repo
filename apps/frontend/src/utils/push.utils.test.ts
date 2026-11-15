// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushOff = vi.fn(async (_input: { reason: string }) => ({ ok: true }));
vi.mock("@frontend/utils/orpc.client", () => ({ orpcFetch: { devices: { pushOff } } }));
vi.mock("@frontend/lib/device/use-device-here", () => ({
	knownDeviceHere: () => undefined,
	refreshDeviceHere: async () => undefined,
}));
vi.mock("@frontend/lib/device/use-device-report", () => ({ reportDevice: async () => undefined }));
vi.mock("@frontend/lib/asks/asks.store", () => ({
	useAsksStore: {
		getState: () => ({ record: async () => undefined, ensureLoaded: async () => ({}) }),
	},
}));

const push = await import("./push.utils");

describe("push belongs to the account, the permission to the phone", () => {
	beforeEach(async () => {
		localStorage.clear();
		pushOff.mockClear();
		await push.unbindPushAccount();
	});

	it("keeps one person's Push off from the next account on the same phone", async () => {
		push.bindPushAccount("rita");
		await push.revokePushForUser({ stickyOptOut: true });
		expect(localStorage.getItem("push.optedOut.rita")).toBe("true");

		await push.unbindPushAccount();
		push.bindPushAccount("ravi");
		expect(localStorage.getItem("push.optedOut.ravi")).toBeNull();
	});

	it("gives the old device-wide opt-out to the person signed in, once", () => {
		localStorage.setItem("push.optedOut", "true");
		push.bindPushAccount("rita");
		expect(localStorage.getItem("push.optedOut.rita")).toBe("true");
		expect(localStorage.getItem("push.optedOut")).toBeNull();
	});

	it("turns push off for this device on the server at sign-out, and keeps the phone's push address", async () => {
		push.bindPushAccount("rita");
		await push.unbindPushAccount();
		// The device is named by its cookie; nothing about the address is kept on the phone.
		expect(pushOff).toHaveBeenCalledWith({ reason: "signed_out" });
	});

	it("says switched off when the person turns push off here", async () => {
		push.bindPushAccount("rita");
		await push.revokePushForUser({ stickyOptOut: true });
		expect(pushOff).toHaveBeenCalledWith({ reason: "switched_off" });
	});
});
