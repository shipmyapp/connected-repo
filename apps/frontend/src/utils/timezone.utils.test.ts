import { afterEach, describe, expect, it, vi } from "vitest";
import { detectUserTimezone } from "./timezone.utils";

describe("detectUserTimezone", () => {
	afterEach(() => vi.restoreAllMocks());

	it("returns the runtime's IANA zone without touching the network", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		expect(detectUserTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("returns null when Intl names no usable zone", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
			() => ({ resolvedOptions: () => ({ timeZone: "" }) }) as Intl.DateTimeFormat,
		);
		expect(detectUserTimezone()).toBeNull();
	});
});
