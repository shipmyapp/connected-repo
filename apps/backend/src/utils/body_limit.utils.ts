import type { IncomingHttpHeaders } from "node:http";

/** Sign-in and session calls carry small JSON. */
const AUTH_BODY_LIMIT_BYTES = 64 * 1024;
/**
 * The app's RPC and mobile handlers: the largest body is an offline push of
 * 20 journal entries (sync.orchestrator.ts batches them).
 */
export const APP_BODY_LIMIT_BYTES = 10 * 1024 * 1024;
/** Everything else (OpenAPI, super-admin). */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;

export const bodyLimitFor = (url: string | undefined): number => {
	if (url?.startsWith("/api/auth")) return AUTH_BODY_LIMIT_BYTES;
	if (url?.startsWith("/api/user-app") || url?.startsWith("/mobile-app")) {
		return APP_BODY_LIMIT_BYTES;
	}
	return DEFAULT_BODY_LIMIT_BYTES;
};

/** True when the request declares a body larger than its route accepts. */
export const declaresTooLargeBody = (
	headers: IncomingHttpHeaders,
	url: string | undefined,
): boolean => Number(headers["content-length"] ?? 0) > bodyLimitFor(url);
