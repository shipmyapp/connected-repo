import type { BrowserOptions } from "@sentry/react";
import { normalizeUrl, normalizeUrlPath } from "./sentry_url_template";

/**
 * Everything the SDK may collect on its own, set explicitly: Sentry 11
 * collects user info (and infers the IP), cookies, headers, bodies and query
 * strings unless told otherwise. The user is named by id alone (setSentryUser).
 */
export const FRONTEND_DATA_COLLECTION = {
	userInfo: false,
	cookies: false,
	httpHeaders: false,
	httpBodies: [],
	urlQueryParams: false,
	graphQL: { document: false, variables: false },
	genAI: { inputs: false, outputs: false },
	mcp: { inputs: false, outputs: false },
	databaseQueryData: false,
	queues: false,
	stackFrameVariables: false,
} satisfies BrowserOptions["dataCollection"];

type StreamedSpan = Parameters<NonNullable<BrowserOptions["beforeSendSpan"]>>[0];
type ErrorEvent = Parameters<NonNullable<BrowserOptions["beforeSend"]>>[0];
type Breadcrumb = Parameters<NonNullable<BrowserOptions["beforeBreadcrumb"]>>[0];

/** A path's shape: ids collapsed, query and hash dropped. */
const pathShape = (path: string): string => normalizeUrlPath(path).replace(/[?#].*$/, "");

/** A URL's or a path's shape, whichever it is. */
const urlShape = (value: string): string =>
	/^https?:\/\//.test(value) ? normalizeUrl(value) : pathShape(value);

/** Attributes that hold a query string or a fragment on their own. */
const QUERY_ATTRIBUTES = new Set(["url.query", "http.query", "url.fragment", "http.fragment"]);

/**
 * Every span before it leaves the browser (page loads, navigations,
 * fetches, web vitals): URL-shaped names and attribute values become
 * route-shaped (`:id`), without their query string or hash.
 */
export const scrubSpan = (span: StreamedSpan): StreamedSpan => {
	span.name = urlShape(span.name);
	const attributes = span.attributes;
	if (!attributes) return span;
	for (const key of Object.keys(attributes)) {
		if (QUERY_ATTRIBUTES.has(key)) {
			delete attributes[key];
			continue;
		}
		const value = attributes[key];
		if (typeof value !== "string") continue;
		if (/^https?:\/\//.test(value)) attributes[key] = normalizeUrl(value);
		else if (value.startsWith("/")) attributes[key] = pathShape(value);
	}
	return span;
};

/** Errors group by URL shape; the query string never goes with them. */
export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
	if (event.transaction) event.transaction = pathShape(event.transaction);
	if (event.request?.url) event.request.url = urlShape(event.request.url);
	if (event.request) delete event.request.query_string;
	return event;
};

/** Navigation and fetch breadcrumbs carry URLs: the same shapes as above. */
export const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
	const data = breadcrumb.data;
	if (data && typeof data.url === "string") data.url = urlShape(data.url);
	if (data && typeof data.to === "string") data.to = pathShape(data.to);
	if (data && typeof data.from === "string") data.from = pathShape(data.from);
	return breadcrumb;
};
