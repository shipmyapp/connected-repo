import { describe, expect, it } from "vitest";
import { normalizeUrl, normalizeUrlPath } from "./sentry_url_template";

describe("normalizeUrlPath", () => {
	it("collapses ULIDs, UUIDs and long digit runs to :id", () => {
		expect(normalizeUrlPath("/journal-entries/01HZX000000000000000000001")).toBe(
			"/journal-entries/:id",
		);
		expect(normalizeUrlPath("/teams/3f2a1b4c-1111-2222-3333-444455556666/settings")).toBe(
			"/teams/:id/settings",
		);
		expect(normalizeUrlPath("/orders/1234567")).toBe("/orders/:id");
		expect(normalizeUrlPath("/profile")).toBe("/profile");
	});
});

describe("normalizeUrl", () => {
	it("drops the query and the hash", () => {
		expect(normalizeUrl("https://app.test/dashboard?code=abc#top")).toBe(
			"https://app.test/dashboard",
		);
		expect(normalizeUrl("https://app.test/journal-entries/01HZX000000000000000000001?x=1")).toBe(
			"https://app.test/journal-entries/:id",
		);
	});
});
