import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { subscriptionAlertWebhookTaskDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import axios from "axios";
import { ulid } from "ulid";
import { assertSafeWebhookUrl, SsrfBlockedError } from "./ssrf_guard.utils";

// Cap response body at 1 MiB — webhooks should return small ack payloads.
const MAX_WEBHOOK_RESPONSE_BYTES = 1024 * 1024;

/**
 * Only these response headers are persisted to the audit log. Anything else
 * (including `set-cookie`, `authorization`, and vendor-specific tokens) is
 * dropped to avoid leaking sensitive material into the JSONB audit trail
 * and to prevent stored-XSS if this JSON is later rendered in an admin UI.
 */
const ALLOWED_RESPONSE_HEADERS = new Set([
	"content-type",
	"content-length",
	"date",
	"x-request-id",
	"x-correlation-id",
]);

/**
 * Content-types whose bodies we consider safe to persist (truncated). HTML,
 * binary blobs, etc. are recorded only as a stub to prevent stored XSS and
 * DB bloat.
 */
const SAFE_BODY_CONTENT_TYPES = ["application/json", "application/problem+json", "text/plain"];

// Truncate response bodies at 2 KB before writing to the audit log.
const MAX_AUDIT_BODY_BYTES = 2 * 1024;
// Hard cap on the final JSONB payload written to `response`.
const MAX_AUDIT_JSON_BYTES = 8 * 1024;

const sanitizeResponseHeaders = (headers: unknown): Record<string, string> => {
	if (!headers || typeof headers !== "object") return {};
	const out: Record<string, string> = {};
	for (const [rawKey, rawVal] of Object.entries(headers as Record<string, unknown>)) {
		const key = rawKey.toLowerCase();
		if (!ALLOWED_RESPONSE_HEADERS.has(key)) continue;
		if (rawVal == null) continue;
		const val = Array.isArray(rawVal) ? rawVal.join(", ") : String(rawVal);
		out[key] = val.length > 512 ? `${val.slice(0, 512)}...[truncated]` : val;
	}
	return out;
};

const getContentType = (headers: unknown): string => {
	if (!headers || typeof headers !== "object") return "";
	const record = headers as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (key.toLowerCase() === "content-type") {
			const val = record[key];
			if (Array.isArray(val)) return String(val[0] ?? "").toLowerCase();
			return String(val ?? "").toLowerCase();
		}
	}
	return "";
};

const sanitizeResponseBody = (
	data: unknown,
	headers: unknown,
): {
	body?: string;
	bodyOmittedReason?: string;
	bodyTruncated?: boolean;
} => {
	if (data == null) return {};
	const contentType = getContentType(headers);
	const isSafe = SAFE_BODY_CONTENT_TYPES.some((ct) => contentType.startsWith(ct));
	if (!isSafe) {
		return {
			bodyOmittedReason: `unsupported content-type: ${contentType || "unknown"}`,
		};
	}

	let text: string;
	try {
		text = typeof data === "string" ? data : JSON.stringify(data);
	} catch {
		return { bodyOmittedReason: "unserializable body" };
	}

	if (text.length > MAX_AUDIT_BODY_BYTES) {
		return {
			body: `${text.slice(0, MAX_AUDIT_BODY_BYTES)}...[truncated]`,
			bodyTruncated: true,
		};
	}
	return { body: text };
};

const enforceJsonSizeCap = (payload: Record<string, unknown>): Record<string, unknown> => {
	try {
		const serialized = JSON.stringify(payload);
		if (serialized.length > MAX_AUDIT_JSON_BYTES) {
			return {
				statusCode: payload.statusCode ?? null,
				error: "response payload exceeded audit size cap",
				approxSizeBytes: serialized.length,
			};
		}
		return payload;
	} catch {
		return {
			statusCode: payload.statusCode ?? null,
			error: "response payload unserializable",
		};
	}
};

/**
 * Handler for subscription alert webhook task
 * Sends webhook notification when subscription usage reaches 90%
 * Logs all execution details to pg_tbus_task_log table for audit trail
 *
 * Retry correlation: pg-tbus does not surface its internal task_id or attempt
 * counter to handlers (its `Handler` type only passes `{ name, input, trigger }`).
 * We therefore derive a stable correlation from `input.payload.timestamp` — the
 * moment the alert was raised — combined with `subscriptionId`. pg-tbus rehydrates
 * the same input on every retry, so this tuple is stable across the retry chain
 * and lets us (a) compute the attempt number, and (b) close prior rows left in
 * `active` (from a crash or a failed log write) before writing the new attempt.
 * `scheduledAt` doubles as the correlation key so we query an indexed
 * timestampNumber column instead of doing a JSON-path scan on `payload`.
 */
export const subscriptionAlertWebhookHandler = async ({
	input,
	trigger,
}: {
	name: string;
	input: {
		subscriptionId: string;
		teamApiId: string;
		payload: {
			event: "subscription.usage_alert";
			subscriptionId: string;
			teamApiId: string;
			apiProductSku: string;
			requestsConsumed: number;
			maxRequests: number;
			usagePercent: number;
			timestamp: number;
		};
	};
	trigger: { type: "direct" } | { type: "event"; e: { id: string; name: string; p: number } };
}) => {
	const startTime = Date.now();
	const logId = ulid();
	const taskName = subscriptionAlertWebhookTaskDef.task_name;
	const scheduledAt = input.payload.timestamp;
	// For event-triggered runs we can correlate on the pg-tbus event id; direct
	// sends have no such id available in the handler args (see header comment).
	const tbusTaskId = trigger.type === "event" ? trigger.e.id : null;

	// Attempt-number correlation. Count prior log rows for the same logical
	// alert (same subscription + same alert timestamp). This is the attempt
	// index for the row we are about to write (0 = first attempt).
	const priorAttempts = await db.pgTbusTaskLogs
		.where({
			taskName,
			entityType: "subscription",
			entityId: input.subscriptionId,
			scheduledAt,
		})
		.count();

	// If a prior attempt exists still in `active`, it was orphaned (crash or
	// failed log-write during the previous run). Close it so getTaskStats
	// counts are accurate and dashboards don't show phantom in-flight tasks.
	if (priorAttempts > 0) {
		await db.pgTbusTaskLogs
			.where({
				taskName,
				entityType: "subscription",
				entityId: input.subscriptionId,
				scheduledAt,
				status: "active",
			})
			.update({
				status: "failed",
				completedAt: startTime,
				success: false,
				errorMessage:
					"Superseded by retry — prior attempt left in active status (process crash or log-write failure)",
				errorCode: "STUCK_ACTIVE_SUPERSEDED",
				willRetry: true,
			});
	}

	// Create initial log entry
	await db.pgTbusTaskLogs.create({
		pgTbusTaskLogId: logId,
		tbusTaskId,
		taskName,
		queueName: env.OTEL_SERVICE_NAME,
		entityType: "subscription",
		entityId: input.subscriptionId,
		teamApiId: input.teamApiId,
		status: "active",
		attemptNumber: priorAttempts,
		scheduledAt,
		startedAt: startTime,
		completedAt: null,
		success: null,
		errorMessage: null,
		errorCode: null,
		responseStatusCode: null,
		payload: input.payload,
		response: null,
		retryLimit: subscriptionAlertWebhookTaskDef.config?.retryLimit ?? 3,
		willRetry: null,
	});

	// Guard the terminal log update so a transient ORM/pool failure at the
	// close step does not leave the row permanently in `active`. Failures here
	// are logged but not rethrown on happy paths — the row will still be closed
	// out by the supersede-on-retry sweep at the top of the next attempt. On
	// the error branch we re-raise the *original* task error after closing so
	// pg-tbus retry semantics are unchanged.
	const closeLogRow = async (patch: Record<string, unknown>): Promise<void> => {
		try {
			await db.pgTbusTaskLogs.find(logId).update(patch);
		} catch (updateError) {
			logger.error(
				{
					logId,
					err: updateError,
					patch,
				},
				"Failed to update pg_tbus_task_log terminal row — will be reconciled by supersede-on-retry sweep",
			);
		}
	};

	try {
		// Get team webhook configuration
		const team = await db.teamsApi
			.find(input.teamApiId)
			.select("subscriptionAlertWebhookBearerToken", "subscriptionAlertWebhookUrl");

		if (!team.subscriptionAlertWebhookUrl) {
			logger.warn(
				{
					logId,
					teamApiId: input.teamApiId,
				},
				"No webhook URL configured for team, skipping webhook",
			);

			// Update log as completed (no webhook configured is not a failure)
			await closeLogRow({
				status: "completed",
				completedAt: Date.now(),
				success: true,
				response: { skipped: true, reason: "No webhook URL configured" },
				willRetry: false,
			});

			return {
				success: true,
				skipped: true,
				reason: "No webhook URL configured",
			};
		}

		const webhookUrl = team.subscriptionAlertWebhookUrl;
		const bearerToken = team.subscriptionAlertWebhookBearerToken;

		// SSRF guard: enforce https, reject private/loopback/link-local/metadata targets.
		// NOTE: This is TOCTOU-vulnerable on its own (DNS may change between check and
		// connect), so we also pass maxRedirects: 0 below to prevent DNS-rebinding
		// and redirect-based bypasses. Long-term, prefer an egress proxy allowlist.
		await assertSafeWebhookUrl(webhookUrl);

		// Send webhook
		const response = await axios.post(webhookUrl, input.payload, {
			timeout: 30000, // 30 second timeout
			maxRedirects: 0, // prevent redirect-based SSRF bypass
			maxContentLength: MAX_WEBHOOK_RESPONSE_BYTES,
			maxBodyLength: MAX_WEBHOOK_RESPONSE_BYTES,
			...(bearerToken
				? {
						headers: {
							Authorization: `Bearer ${bearerToken}`,
							"Content-Type": "application/json",
						},
					}
				: {
						headers: {
							"Content-Type": "application/json",
						},
					}),
		});

		const duration = Date.now() - startTime;

		// Update log with success. Whitelist headers and skip the body on the
		// happy path — the ack is expected to be empty/small and we don't want
		// untrusted third-party bytes in our audit log.
		await closeLogRow({
			status: "completed",
			completedAt: Date.now(),
			success: true,
			responseStatusCode: response.status,
			response: enforceJsonSizeCap({
				statusCode: response.status,
				statusText: response.statusText,
				headers: sanitizeResponseHeaders(response.headers),
			}),
			willRetry: false,
		});

		return {
			success: true,
			statusCode: response.status,
			duration,
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		const isAxiosError = axios.isAxiosError(error);
		const isSsrfBlocked = error instanceof SsrfBlockedError;

		const errorMessage = isAxiosError
			? error.message
			: error instanceof Error
				? error.message
				: "Unknown error";

		const errorCode = isSsrfBlocked
			? "SSRF_BLOCKED"
			: isAxiosError
				? (error.code ?? "HTTP_ERROR")
				: "INTERNAL_ERROR";

		const statusCode = isAxiosError && error.response ? error.response.status : null;

		logger.error(
			{
				logId,
				error: errorMessage,
				errorCode,
				statusCode,
				duration,
				subscriptionId: input.subscriptionId,
				teamApiId: input.teamApiId,
			},
			"Webhook failed",
		);

		// Update log with failure. SSRF-blocked URLs are a permanent config error —
		// do not retry so we don't hammer the log with predictable failures.
		await closeLogRow({
			status: "failed",
			completedAt: Date.now(),
			success: false,
			errorMessage,
			errorCode,
			responseStatusCode: statusCode,
			response:
				isAxiosError && error.response
					? enforceJsonSizeCap({
							statusCode: error.response.status,
							statusText: error.response.statusText,
							headers: sanitizeResponseHeaders(error.response.headers),
							...sanitizeResponseBody(error.response.data, error.response.headers),
						})
					: null,
			willRetry: !isSsrfBlocked, // pg-tbus will retry based on config, except SSRF
		});

		// Re-throw to trigger pg-tbus retry mechanism (pg-tbus will honor retry
		// config; SSRF-blocked will still bubble but we've marked willRetry false).
		throw error;
	}
};
