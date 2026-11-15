import { describe, expect, it } from "vitest";
import { isInAppPath } from "./sw-navigate";

describe("isInAppPath", () => {
	it("accepts the app's own paths only", () => {
		expect(isInAppPath("/journal-entries/01HX")).toBe(true);
		expect(isInAppPath("/dashboard?x=1#y")).toBe(true);
		expect(isInAppPath("//evil.example/x")).toBe(false);
		expect(isInAppPath("/\\evil.example")).toBe(false);
		expect(isInAppPath("https://evil.example/")).toBe(false);
		expect(isInAppPath(42)).toBe(false);
	});
});
