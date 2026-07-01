import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import type {
	NodeHttpRequest,
	NodeHttpResponse,
} from "@orpc/standard-server-node";

// Trace-propagation headers that every handler must let through:
// - `traceparent` / `tracestate` = W3C Trace Context (vendor-neutral standard)
// - `baggage` = W3C Baggage (Sentry piggybacks its DSC here as sentry-* keys)
// - `sentry-trace` = Sentry-specific format, kept for browser SDK compatibility
export const TRACE_HEADERS_ALLOW = [
	"traceparent",
	"tracestate",
	"baggage",
	"sentry-trace",
] as const;

// Response headers the browser needs `Access-Control-Expose-Headers` for:
// x-trace-id is our echo of the current span; traceparent lets a downstream
// non-browser client re-inject the same trace into its own OTel context.
export const TRACE_HEADERS_EXPOSE = ["x-trace-id", "traceparent"] as const;

/**
 * Handles CORS headers for all better-auth incoming requests.
 *
 * @returns true if the request was an OPTIONS preflight and the response was sent.
 */
export function handleBetterAuthCors(
	req: NodeHttpRequest,
	res: NodeHttpResponse,
): boolean {
	const originHeader = req.headers.origin || req.headers[":origin"];
	const currentOrigin = Array.isArray(originHeader)
		? originHeader[0]
		: originHeader;

	if (!currentOrigin) {
		return false;
	}

	// 1. Determine if the origin is allowed
	const isAllowed = allowedOrigins.includes(currentOrigin);

	if (isAllowed) {
		res.setHeader("Access-Control-Allow-Origin", currentOrigin);
		res.setHeader(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, PATCH, OPTIONS",
		);
		res.setHeader(
			"Access-Control-Allow-Headers",
			[
				"Content-Type",
				"Authorization",
				"x-csrf-token",
				"x-requested-with",
				...TRACE_HEADERS_ALLOW,
			].join(", "),
		);
		res.setHeader(
			"Access-Control-Expose-Headers",
			TRACE_HEADERS_EXPOSE.join(", "),
		);
		res.setHeader("Access-Control-Allow-Credentials", "true");
		res.setHeader("Vary", "Origin");
	} else {
		console.warn(
			`[CORS] BLOCKED: ${currentOrigin} for ${req.method} ${req.url}`,
		);
	}

	// 2. Handle Preflight (OPTIONS)
	if (req.method?.toUpperCase() === "OPTIONS") {
		res.statusCode = 204;
		res.setHeader("Content-Length", "0");
		res.end();
		return true;
	}

	return false;
}
