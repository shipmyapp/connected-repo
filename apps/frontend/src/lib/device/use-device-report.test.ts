// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const report = vi.fn(async (_input: Record<string, unknown>) => ({ ok: true }));
vi.mock("@frontend/utils/orpc.client", () => ({
	orpcFetch: { devices: { report: (input: Record<string, unknown>) => report(input) } },
}));
vi.mock("./use-device-here", () => ({ refreshDeviceHere: async () => undefined }));
const snapshot = vi.hoisted(() => ({ isInstalled: false }));
vi.mock("@frontend/utils/install-prompt", () => ({
	getInstallSnapshot: () => snapshot,
	subscribeInstall: () => () => undefined,
}));

const { reportDevice, useDeviceReport } = await import("./use-device-report");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the device report", () => {
	beforeEach(() => {
		report.mockClear();
		vi.useFakeTimers({ toFake: ["Date"] });
		localStorage.clear();
	});
	afterEach(() => vi.useRealTimers());

	it("sends what the device is once a visit, and again only when something changed or an hour passed", async () => {
		const { unmount } = renderHook(() => useDeviceReport("rita"));
		await flush();
		expect(report).toHaveBeenCalledTimes(1);
		expect(report.mock.calls[0]?.[0]).toMatchObject({
			platform: "desktop",
			isStandalone: false,
			pushPermission: "unsupported",
		});

		// Back at the front a minute later: nothing new to say.
		document.dispatchEvent(new Event("visibilitychange"));
		await flush();
		expect(report).toHaveBeenCalledTimes(1);

		// An hour later: told again.
		vi.setSystemTime(Date.now() + 60 * 60 * 1000);
		document.dispatchEvent(new Event("visibilitychange"));
		await flush();
		expect(report).toHaveBeenCalledTimes(2);
		unmount();
	});

	it("rides the push address on the same report, and forgets the old report caches", async () => {
		localStorage.setItem("push.fcmToken", "old");
		localStorage.setItem("push.bannerDismissed", "true");
		renderHook(() => useDeviceReport("rita"));
		await flush();
		await reportDevice({ fcmToken: "token-1", pushPermission: "granted" });
		expect(report).toHaveBeenLastCalledWith(
			expect.objectContaining({ fcmToken: "token-1", pushPermission: "granted" }),
		);
		expect(localStorage.getItem("push.fcmToken")).toBeNull();
		expect(localStorage.getItem("push.bannerDismissed")).toBeNull();
	});

	it("says installed when the browser knows it, and sends nothing signed out", async () => {
		renderHook(() => useDeviceReport(null));
		await flush();
		expect(report).not.toHaveBeenCalled();
		snapshot.isInstalled = true;
		await reportDevice({}, { force: true });
		expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ isInstalled: true }));
		snapshot.isInstalled = false;
	});
});
