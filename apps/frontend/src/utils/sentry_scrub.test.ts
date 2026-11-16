import { describe, expect, it } from "vitest";
import { FRONTEND_DATA_COLLECTION, scrubBreadcrumb, scrubEvent, scrubSpan } from "./sentry_scrub";

const ID = "01HZX000000000000000000001";

const span = (
	name: string,
	attributes: Record<string, string | number>,
): Parameters<typeof scrubSpan>[0] => ({
	name,
	attributes,
	span_id: "aaaaaaaaaaaaaaaa",
	trace_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	start_timestamp: 1,
	end_timestamp: 2,
	status: "ok",
	is_segment: true,
});

describe("FRONTEND_DATA_COLLECTION", () => {
	it("collects nothing about the person or the requests beyond what the app sets", () => {
		expect(FRONTEND_DATA_COLLECTION).toMatchObject({
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			databaseQueryData: false,
			stackFrameVariables: false,
		});
	});
});

describe("scrubSpan", () => {
	it("gives a page-load span a route-shaped name without its query", () => {
		expect(scrubSpan(span(`/journal-entries/${ID}?tab=files#top`, {})).name).toBe(
			"/journal-entries/:id",
		);
	});

	it("names an unresolved page load after the page's shape", () => {
		expect(scrubSpan(span("Pageload", { "url.path": `/journal-entries/${ID}` })).name).toBe(
			"/journal-entries/:id",
		);
	});

	it("normalises URL and path attributes and drops query attributes", () => {
		const { attributes } = scrubSpan(
			span("GET api.example.com", {
				"url.full": `https://api.example.com/api/files/${ID}?token=secret`,
				"url.path": `/api/files/${ID}?token=secret`,
				"url.query": "token=secret",
				"http.response.status_code": 200,
			}),
		);
		expect(attributes).toEqual({
			"url.full": "https://api.example.com/api/files/:id",
			"url.path": "/api/files/:id",
			"http.response.status_code": 200,
		});
	});
});

describe("scrubEvent", () => {
	it("normalises the transaction and the URL, and drops the query string", () => {
		const event = scrubEvent({
			type: undefined,
			transaction: `/journal-entries/${ID}?code=abc`,
			request: { url: `https://app.test/journal-entries/${ID}?code=abc`, query_string: "code=abc" },
		});
		expect(event.transaction).toBe("/journal-entries/:id");
		expect(event.request).toEqual({ url: "https://app.test/journal-entries/:id" });
	});
});

describe("scrubBreadcrumb", () => {
	it("normalises the URLs of navigation and fetch breadcrumbs", () => {
		const crumb = scrubBreadcrumb({
			data: { url: `/api/files/${ID}?token=secret`, from: `/a/${ID}?x=1`, to: "/b#top" },
		});
		expect(crumb.data).toEqual({ url: "/api/files/:id", from: "/a/:id", to: "/b" });
	});
});
