import { env } from "@backend/configs/env.config";
import type { DomainError } from "@backend/utils/errorParser";
import { trace } from "@opentelemetry/api";
import { ORPCError } from "@orpc/server";
import * as Sentry from "@sentry/node";

const capturedErrors = new WeakSet<object>();

const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

// 4xx ORPC errors are expected outcomes (auth, validation) — not bugs.
const isBuggyError = (e: unknown) => {
	if (!(e instanceof ORPCError)) return true;
	return e.status >= 500 || e.code === "INTERNAL_SERVER_ERROR";
};

export interface CaptureOptions {
	captureAll?: boolean;
	domain?: DomainError;
	context?: Record<string, unknown>;
	tags?: Record<string, string>;
}

export function captureBackendException(
	error: unknown,
	options: CaptureOptions = {},
) {
	if (!env.SENTRY_DSN || !Sentry.isInitialized()) return;
	if (!options.captureAll && !isBuggyError(error)) return;

	const original = error instanceof ORPCError ? error.cause || error : error;
	const err = toError(original);
	if (capturedErrors.has(err)) return;
	capturedErrors.add(err);

	const traceId = trace.getActiveSpan()?.spanContext()?.traceId;
	const { domain, context, tags } = options;

	Sentry.withScope((scope) => {
		const finalTags: Record<string, string> = { ...(tags ?? {}) };
		if (domain) {
			finalTags["domain.code"] = domain.code;
			if (domain.surface) finalTags["domain.surface"] = domain.surface;
			finalTags["domain.cause"] = domain.fingerprint[0] ?? "unknown";
		}
		if (traceId) finalTags.trace_id = traceId;
		scope.setTags(finalTags);

		if (domain) {
			scope.setFingerprint(domain.fingerprint);
			scope.setContext("domain", { ...domain, traceId });
		}
		if (context) {
			// Split the well-known pg sub-context onto its own Sentry card so
			// future callers adding `backend.foo` don't collide with the pg
			// payload, and so it shows up distinctly on the issue page.
			const { pg, ...rest } = context as Record<string, unknown>;
			if (pg && typeof pg === "object") {
				scope.setContext("pg", pg as Record<string, unknown>);
			}
			if (Object.keys(rest).length > 0) scope.setContext("backend", rest);
		}

		Sentry.captureException(err);
	});
}

export async function flushBackendErrorTracking(timeoutMs = 2000) {
	if (!env.SENTRY_DSN || !Sentry.isInitialized()) return;
	await Sentry.flush(timeoutMs);
}
