// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const here = vi.fn();
vi.mock("@frontend/lib/device/use-device-here", () => ({
	fetchDeviceHere: () => here(),
	refreshDeviceHere: async () => undefined,
	useDeviceHere: () => ({ data: undefined }),
}));
vi.mock("@frontend/utils/orpc.client", () => ({
	orpcFetch: {
		me: { asks: async () => ({}) },
		devices: { recordInstallTry: async () => ({ ok: true }) },
	},
}));

const { mayOfferInstallNow, markInstallOfferShown, resetInstallRecordForTests } = await import(
	"./install-record"
);

describe("the install offer on this device (per-device record)", () => {
	beforeEach(() => resetInstallRecordForTests());

	it("never offers where the app is installed here, the server's pairing included", async () => {
		here.mockResolvedValue({ installedHere: true, installOfferDue: true });
		expect(await mayOfferInstallNow()).toBe(false);
	});

	it("offers on a device without the app once 48 hours have passed, at most once a visit", async () => {
		here.mockResolvedValue({ installedHere: false, installOfferDue: false });
		expect(await mayOfferInstallNow()).toBe(false);
		here.mockResolvedValue({ installedHere: false, installOfferDue: true });
		expect(await mayOfferInstallNow()).toBe(true);
		markInstallOfferShown();
		expect(await mayOfferInstallNow()).toBe(false);
	});

	it("offers once a visit when the device cannot be read, and never offline", async () => {
		here.mockResolvedValue(null);
		expect(await mayOfferInstallNow()).toBe(true);
		const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		expect(await mayOfferInstallNow()).toBe(false);
		onLine.mockRestore();
	});
});
