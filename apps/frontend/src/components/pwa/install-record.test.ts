// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	INSTALL_OFFER_EVERY_MS,
	markInstallOfferShown,
	mayOfferInstallNow,
	reportInstallTry,
	resetInstallRecordForTests,
} from "./install-record";

describe("the local install record (seam)", () => {
	beforeEach(() => {
		localStorage.clear();
		resetInstallRecordForTests();
		vi.useRealTimers();
	});

	it("offers once a visit, then again 48 hours after it was last shown or closed", async () => {
		expect(await mayOfferInstallNow()).toBe(true);
		reportInstallTry("shown");
		markInstallOfferShown();
		expect(await mayOfferInstallNow()).toBe(false);
		resetInstallRecordForTests();
		expect(await mayOfferInstallNow()).toBe(false);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.now() + INSTALL_OFFER_EVERY_MS + 1);
		expect(await mayOfferInstallNow()).toBe(true);
	});

	it("never offers offline, and forgets the old 3-day key", async () => {
		localStorage.setItem("pwa.installSheetDismissedAt", "1");
		const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		expect(await mayOfferInstallNow()).toBe(false);
		onLine.mockReturnValue(true);
		expect(await mayOfferInstallNow()).toBe(true);
		expect(localStorage.getItem("pwa.installSheetDismissedAt")).toBeNull();
		onLine.mockRestore();
	});
});
