import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { logger } from "@backend/utils/logger.utils";
import { ORPCError } from "@orpc/server";
import { ZodError } from "zod";

/**
 * Canonical error shape. Built at the handler boundary, sent to clients as
 * the HTTP response body, and used as the Sentry payload. `fingerprint` is
 * what makes Sentry group by *cause* instead of by stack trace.
 */
export interface DomainError {
	code: string;
	httpStatus: number;
	message: string;
	userFriendlyMessage: string;
	actionRequired?: string;
	details?: Record<string, unknown>;
	surface?: string;
	fingerprint: string[];
}

interface PgError extends Error {
	code?: string;
	constraint?: string;
	detail?: string;
	table?: string;
	schema?: string;
	column?: string;
	hint?: string;
	where?: string;
	file?: string;
	line?: string;
	routine?: string;
	severity?: string;
	internalQuery?: string;
	position?: string;
	internalPosition?: string;
}

/**
 * Sentry context payload built from a Postgres / orchid-orm `QueryError`.
 * Schema/constraint failures (especially the 42xxx class — "syntax / access
 * rule") carry the SQL routine and constraint name on the issue page itself,
 * eliminating the pino-grep step during triage.
 *
 * `internalQuery` is truncated because some queries are multi-KB and Sentry
 * contexts have a payload budget.
 */
function pgContext(err: PgError): Record<string, unknown> | null {
	if (!err.code) return null;
	const ctx: Record<string, unknown> = { code: err.code };
	if (err.severity) ctx.severity = err.severity;
	if (err.schema) ctx.schema = err.schema;
	if (err.table) ctx.table = err.table;
	if (err.column) ctx.column = err.column;
	if (err.constraint) ctx.constraint = err.constraint;
	if (err.detail) ctx.detail = err.detail;
	if (err.hint) ctx.hint = err.hint;
	if (err.where) ctx.where = err.where;
	if (err.file) ctx.file = err.file;
	if (err.line) ctx.line = err.line;
	if (err.routine) ctx.routine = err.routine;
	if (err.position) ctx.position = err.position;
	if (err.internalPosition) ctx.internalPosition = err.internalPosition;
	if (err.internalQuery) ctx.internalQuery = msgPrefix(err.internalQuery, 2000);
	return ctx;
}

const INTERNAL_COLS = new Set([
	"id",
	"team_id",
	"user_id",
	"created_at",
	"updated_at",
]);

function parsePgDetail(detail: string | undefined): {
	column: string;
	value: string;
} {
	const match = detail?.match(/Key \(([^)]+)\)=\((.*)\) already exists/);
	const columns = match?.[1]?.split(", ") ?? [];
	const values = match?.[2]?.split(", ") ?? [];
	const idx = columns.findIndex((c) => !INTERNAL_COLS.has(c));
	if (idx < 0) return { column: "", value: "" };
	return { column: columns[idx] ?? "", value: values[idx] ?? "" };
}

/**
 * PostgreSQL returns column names in snake_case; clients key server field
 * errors by the Zod schema path (camelCase). Bridging here lets the form
 * highlight the offending field inline instead of falling through to the
 * generic error banner.
 */
function snakeToCamel(s: string): string {
	return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const msgPrefix = (m = "", n = 80) => m.slice(0, n);

interface OrpcValidationCarrier {
	message?: string;
	issues: Array<{ path?: Array<string | number>; message?: string }>;
}

/**
 * The oRPC framework throws its `ValidationError` either as the error itself
 * (input pipeline) or as `error.cause` (when re-wrapped). Detect both shapes
 * so the parser surfaces a 400 in either case.
 */
function extractOrpcValidationError(
	error: unknown,
): OrpcValidationCarrier | null {
	const isCarrier = (e: unknown): e is OrpcValidationCarrier =>
		!!e &&
		typeof e === "object" &&
		(e as { name?: string }).name === "ValidationError" &&
		Array.isArray((e as { issues?: unknown }).issues);
	if (isCarrier(error)) return error;
	const cause = (error as { cause?: unknown }).cause;
	if (isCarrier(cause)) return cause;
	return null;
}

function extractZodError(error: unknown): ZodError | null {
	if (error instanceof ZodError) return error;
	const cause = (error as { cause?: unknown }).cause;
	if (cause instanceof ZodError) return cause;
	return null;
}

export function orpcErrorParser(
	error: Error,
	ctx: { handler?: string } = {},
): DomainError {
	const handler = ctx.handler ?? "unknown";

	const zodError = extractZodError(error);
	if (zodError) {
		const fieldErrors: Record<string, string[]> = {};
		const formErrors: string[] = [];
		for (const issue of zodError.issues) {
			if (issue.path.length === 0) {
				formErrors.push(issue.message);
			} else {
				const pathKey = issue.path.join(".");
				fieldErrors[pathKey] ??= [];
				fieldErrors[pathKey].push(issue.message);
			}
		}
		const firstField = Object.keys(fieldErrors)[0] ?? "form";
		return {
			code: "VALIDATION_ERROR",
			httpStatus: 400,
			message: "Validation failed",
			userFriendlyMessage: "Please check the provided data and try again",
			actionRequired: "Fix validation errors and resubmit",
			details: { fieldErrors, formErrors },
			fingerprint: ["input_invalid", handler, firstField],
		};
	}

	// oRPC framework `ValidationError` — covers BOTH input and output validation.
	const validation = extractOrpcValidationError(error);
	if (validation) {
		const isInput = (validation.message ?? error.message ?? "")
			.toLowerCase()
			.includes("input");

		if (isInput) {
			const fieldErrors: Record<string, string[]> = {};
			const formErrors: string[] = [];
			for (const issue of validation.issues) {
				const path = issue.path ?? [];
				const msg = issue.message ?? "Invalid value";
				if (path.length === 0) {
					formErrors.push(msg);
				} else {
					const pathKey = path.join(".");
					fieldErrors[pathKey] ??= [];
					fieldErrors[pathKey].push(msg);
				}
			}
			const firstField = Object.keys(fieldErrors)[0] ?? "form";
			return {
				code: "VALIDATION_ERROR",
				httpStatus: 400,
				message: "Validation failed",
				userFriendlyMessage: "Please check the provided data and try again",
				actionRequired: "Fix validation errors and resubmit",
				details: { fieldErrors, formErrors },
				fingerprint: ["input_invalid", handler, firstField],
			};
		}

		// Output validation — server-side schema drift.
		const pathHead =
			validation.issues[0]?.path?.slice(0, 2).join(".") ?? "unknown";
		return {
			code: "OUTPUT_VALIDATION_ERROR",
			httpStatus: 500,
			message: error.message || "Output validation failed",
			userFriendlyMessage: "The server returned data in an unexpected shape.",
			actionRequired:
				"Engineering — payload likely has stale enum or schema drift",
			details: { issues: validation.issues as unknown[] },
			fingerprint: ["output_invalid", handler, pathHead],
		};
	}

	const pg = error as unknown as PgError;

	if (pg.code === "23505") {
		const { column, value } = parsePgDetail(pg.detail);
		const friendly = column.replace(/_/g, " ");
		// PostgreSQL renders a NULL conflict (only possible on
		// `unique(..., { nullsNotDistinct: true })` constraints) as the literal
		// string "null" in the detail text. Render a user-friendly message
		// instead of the technically-correct-but-confusing "'null' is already
		// taken for X".
		const isNullConflict = value === "null";
		const msg = isNullConflict
			? friendly
				? `Another record already has no ${friendly}`
				: "Another record already exists with no value here"
			: value && friendly
				? `'${value}' is already taken for ${friendly}`
				: "This resource already exists";
		// Emit a `fieldErrors` map keyed by the camelCase Zod-schema path so the
		// client picks this up and highlights the offending field inline.
		const camelColumn = column ? snakeToCamel(column) : "";
		const fieldErrors = camelColumn ? { [camelColumn]: [msg] } : {};
		return {
			code: "DUPLICATE_RESOURCE",
			httpStatus: 409,
			message: msg,
			userFriendlyMessage: msg,
			actionRequired: "Use a different value or update the existing resource",
			details: {
				constraint: pg.constraint,
				table: pg.table,
				column,
				value,
				fieldErrors,
			},
			fingerprint: [
				"pg_unique",
				pg.table ?? "unknown",
				column || pg.constraint || "unknown",
			],
		};
	}

	const dbMsg = `${error.message?.toLowerCase() ?? ""} ${error.cause instanceof Error ? error.cause.message.toLowerCase() : ""}`;

	if (pg.code === "23503" || dbMsg.includes("foreign key")) {
		return {
			code: "INVALID_REFERENCE",
			httpStatus: 400,
			message: "Invalid reference to related resource",
			userFriendlyMessage: "The referenced resource does not exist",
			details: { constraint: pg.constraint ?? "foreign_key", table: pg.table },
			fingerprint: [
				"pg_fk",
				pg.table ?? "unknown",
				pg.constraint ?? msgPrefix(error.message, 40),
			],
		};
	}

	if (dbMsg.includes("not found") || dbMsg.includes("does not exist")) {
		return {
			code: "NOT_FOUND",
			httpStatus: 404,
			message: "Resource not found",
			userFriendlyMessage: "The requested resource could not be found",
			fingerprint: ["not_found", handler, msgPrefix(error.message, 40)],
		};
	}

	// Expected oRPC business outcomes — captureBackendException filters these out of Sentry.
	if (error instanceof ORPCError) {
		const statusByCode: Record<string, number> = {
			BAD_REQUEST: 400,
			UNAUTHORIZED: 401,
			FORBIDDEN: 403,
			NOT_FOUND: 404,
			CONFLICT: 409,
			PRECONDITION_FAILED: 412,
			TOO_MANY_REQUESTS: 429,
		};
		const status = statusByCode[error.code] ?? 500;
		return {
			code: error.code,
			httpStatus: status,
			message: error.message,
			userFriendlyMessage: error.message,
			fingerprint: ["orpc", error.code.toLowerCase(), handler],
		};
	}

	// Fallthrough: uncaught throws. The literal message is a stable identity for grouping.
	return {
		code: "INTERNAL_SERVER_ERROR",
		httpStatus: 500,
		message: "An unexpected error occurred",
		userFriendlyMessage: "Something went wrong on our end",
		fingerprint: ["uncaught", handler, msgPrefix(error.message, 80)],
	};
}

/**
 * Single boundary: parse → Sentry → log → throwable ORPCError. Call from the
 * handler's interceptor catch. Do NOT also call from `onError` — that would
 * build the domain twice and the WeakSet dedupe only saves Sentry, not work.
 */
export function handleBoundaryError(error: unknown, handler: string) {
	const err = error instanceof Error ? error : new Error(String(error));
	const causeRaw = err instanceof ORPCError ? (err.cause ?? err) : err;
	const cause =
		causeRaw instanceof Error ? causeRaw : new Error(String(causeRaw));

	const domain: DomainError = {
		...orpcErrorParser(cause, { handler }),
		surface: `backend.${handler}`,
	};

	// Attach Postgres telemetry (code, constraint, routine, internalQuery, …)
	// for any underlying QueryError. Without this, schema-class failures show
	// only the masked client message on the Sentry event and the SQLSTATE has
	// to be recovered by trace_id-grepping the pino logs.
	const pg = pgContext(cause as PgError);
	const context = pg ? { pg } : undefined;

	captureBackendException(err, { domain, tags: { handler }, context });
	logger.error(
		{ err: cause, code: domain.code, fingerprint: domain.fingerprint },
		"boundary error",
	);

	// Map HTTP status to a standard ORPC error code to satisfy type safety,
	// while carrying the specific domain code in the response `data` payload.
	const responseCodeByStatus: Record<number, string> = {
		400: "BAD_REQUEST",
		401: "UNAUTHORIZED",
		403: "FORBIDDEN",
		404: "NOT_FOUND",
		409: "CONFLICT",
		412: "PRECONDITION_FAILED",
		429: "TOO_MANY_REQUESTS",
		500: "INTERNAL_SERVER_ERROR",
	};
	const responseCode = (responseCodeByStatus[domain.httpStatus] ??
		"INTERNAL_SERVER_ERROR") as ConstructorParameters<typeof ORPCError>[0];

	return new ORPCError(responseCode, {
		status: domain.httpStatus,
		message: domain.message,
		data: { ...(domain.details ?? {}), domainCode: domain.code },
		cause: error,
	});
}
