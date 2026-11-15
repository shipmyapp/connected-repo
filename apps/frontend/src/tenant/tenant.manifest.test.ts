// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { linkManifest } from "./tenant.manifest";

const manifestLinks = () => [
	...document.querySelectorAll<HTMLLinkElement>('link[rel~="manifest"]'),
];

describe("the page's manifest link on a team's host", () => {
	beforeEach(() => {
		document.head.innerHTML = "";
	});

	it("points the page's one link at the team's manifest", () => {
		document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest">';
		linkManifest("/api/tenant/manifest.webmanifest?slug=acme");
		expect(manifestLinks().map((link) => link.getAttribute("href"))).toEqual([
			"/api/tenant/manifest.webmanifest?slug=acme",
		]);
	});

	it("leaves exactly one link when the page carries two", () => {
		document.head.innerHTML =
			'<link rel="manifest" href="/manifest.webmanifest" /><link rel="manifest" href="/manifest.webmanifest">';
		linkManifest("/api/tenant/manifest.webmanifest?slug=acme");
		expect(manifestLinks()).toHaveLength(1);
		expect(manifestLinks()[0]?.getAttribute("href")).toBe(
			"/api/tenant/manifest.webmanifest?slug=acme",
		);
	});

	it("adds the link when the page has none (the dev server without the plugin's dev mode)", () => {
		linkManifest("/api/tenant/manifest.webmanifest?slug=acme");
		expect(manifestLinks()).toHaveLength(1);
	});
});
