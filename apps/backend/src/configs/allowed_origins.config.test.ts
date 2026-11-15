import { describe, expect, it } from "vitest";
import { teamHostSlugFromOrigin } from "./allowed_origins.config";

const ROOT = "example.com";

describe("teamHostSlugFromOrigin (production rules)", () => {
	const slug = (origin: string) => teamHostSlugFromOrigin(origin, ROOT, false);

	it("accepts an https team host on the default port", () => {
		expect(slug("https://acme.example.com")).toBe("acme");
	});
	it("refuses plain http and explicit ports", () => {
		expect(slug("http://acme.example.com")).toBeNull();
		expect(slug("https://acme.example.com:8443")).toBeNull();
	});
	it("refuses the root, reserved labels and nested labels", () => {
		expect(slug("https://example.com")).toBeNull();
		expect(slug("https://www.example.com")).toBeNull();
		expect(slug("https://cdn.example.com")).toBeNull();
		expect(slug("https://app.example.com")).toBeNull();
		expect(slug("https://a.b.example.com")).toBeNull();
	});
	it("refuses look-alikes and other domains", () => {
		expect(slug("https://acme.example.com.evil.test")).toBeNull();
		expect(slug("https://evilexample.com")).toBeNull();
		expect(slug("https://evil.test")).toBeNull();
	});
	it("refuses anything that is not a bare origin", () => {
		expect(slug("https://acme.example.com/")).toBeNull();
		expect(slug("https://acme.example.com/path")).toBeNull();
		expect(slug("https://user@acme.example.com")).toBeNull();
		expect(slug("javascript:alert(1)")).toBeNull();
		expect(slug("null")).toBeNull();
		expect(slug("")).toBeNull();
	});
	it("is off without a root", () => {
		expect(teamHostSlugFromOrigin("https://acme.example.com", undefined, false)).toBeNull();
	});
});

describe("teamHostSlugFromOrigin (development and tests)", () => {
	it("accepts http and a port", () => {
		expect(teamHostSlugFromOrigin("http://team1.localhost:5173", "localhost", true)).toBe("team1");
	});
	it("still refuses other schemes and reserved labels", () => {
		expect(teamHostSlugFromOrigin("ftp://team1.localhost", "localhost", true)).toBeNull();
		expect(teamHostSlugFromOrigin("http://www.localhost:5173", "localhost", true)).toBeNull();
	});
});
