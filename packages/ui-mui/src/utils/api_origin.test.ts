import { describe, expect, it } from "vitest";
import { resolveApiOrigin } from "./api_origin";

describe("resolveApiOrigin", () => {
	it("falls back to the page's origin when nothing is configured", () => {
		expect(resolveApiOrigin(undefined, "https://admin.example.com")).toBe(
			"https://admin.example.com",
		);
		expect(resolveApiOrigin("  ", "https://admin.example.com")).toBe("https://admin.example.com");
	});

	it("drops a trailing slash from a configured origin", () => {
		expect(resolveApiOrigin("http://localhost:3000/", "x")).toBe("http://localhost:3000");
	});
});
