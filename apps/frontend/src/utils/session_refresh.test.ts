import { beforeEach, describe, expect, it } from "vitest";
import { consumeFreshSessionRequest, requestFreshSession } from "./session_refresh.client";

describe("session_refresh", () => {
	beforeEach(() => {
		// Drain any flag a previous case left behind.
		consumeFreshSessionRequest();
	});

	it("is off until something asks for a fresh session", () => {
		expect(consumeFreshSessionRequest()).toBe(false);
	});

	it("reports the request exactly once", () => {
		requestFreshSession();
		expect(consumeFreshSessionRequest()).toBe(true);
		// The second read must be false: leaving it latched would put an
		// uncached session round-trip in front of every later navigation.
		expect(consumeFreshSessionRequest()).toBe(false);
	});

	it("collapses repeated requests into a single bypass", () => {
		requestFreshSession();
		requestFreshSession();
		expect(consumeFreshSessionRequest()).toBe(true);
		expect(consumeFreshSessionRequest()).toBe(false);
	});
});
