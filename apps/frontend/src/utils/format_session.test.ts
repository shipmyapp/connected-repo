import { describe, expect, it } from "vitest";
import { describeSession } from "./format_session";

describe("describeSession", () => {
	it("names the browser and the system", () => {
		expect(describeSession({ browser: "Chrome", os: "macOS", device: null })).toBe(
			"Chrome on macOS",
		);
	});

	it("adds the device when it says more", () => {
		expect(describeSession({ browser: "Safari", os: "iOS", device: "Apple iPhone" })).toBe(
			"Safari on iOS · Apple iPhone",
		);
	});

	it("does not repeat a device already named", () => {
		expect(describeSession({ browser: "Chrome", os: "Android", device: "Android" })).toBe(
			"Chrome on Android",
		);
	});

	it("falls back when nothing is known", () => {
		expect(describeSession({ browser: null, os: null, device: null })).toBe("Unknown device");
		expect(describeSession({ browser: null, os: null, device: "mobile" })).toBe("mobile");
	});
});
