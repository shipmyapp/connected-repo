/**
 * Turning an oRPC failure into one sentence, and reading who the backend
 * says the caller is (401 signed out, 403 refused). Shared by every app;
 * no oRPC import, so it works on any error-like value.
 */

/** Who the backend says the caller is, read from a refused call. */
export type AccessState = "SIGNED_OUT" | "NOT_SUPER_ADMIN";

type ErrorLike = { code?: unknown; status?: unknown; message?: unknown; data?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const asErrorLike = (error: unknown): ErrorLike | null => (isRecord(error) ? error : null);

export const accessStateOf = (error: unknown): AccessState | null => {
	const err = asErrorLike(error);
	if (!err) return null;
	if (err.status === 401 || err.code === "UNAUTHORIZED") return "SIGNED_OUT";
	if (err.status === 403 || err.code === "FORBIDDEN") return "NOT_SUPER_ADMIN";
	return null;
};

export const isAccessError = (error: unknown): boolean => accessStateOf(error) !== null;

const GENERIC = "Something went wrong. Try again.";

const joinFieldErrors = (data: unknown): string | null => {
	if (!isRecord(data)) return null;
	const lines: string[] = [];
	const { fieldErrors, formErrors } = data;
	if (isRecord(fieldErrors)) {
		for (const [field, messages] of Object.entries(fieldErrors)) {
			if (Array.isArray(messages)) lines.push(`${field}: ${messages.join(", ")}`);
		}
	}
	if (Array.isArray(formErrors)) {
		for (const message of formErrors) if (typeof message === "string") lines.push(message);
	}
	return lines.length > 0 ? lines.join("; ") : null;
};

// A procedure that passes its schema's error through as the message,
// which Zod writes as a JSON array of issues.
const joinIssueMessage = (message: string): string | null => {
	if (!message.trimStart().startsWith("[")) return null;
	try {
		const parsed: unknown = JSON.parse(message);
		if (!Array.isArray(parsed)) return null;
		const lines = parsed.flatMap((issue) => {
			if (!isRecord(issue) || typeof issue.message !== "string") return [];
			const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
			return [path ? `${path}: ${issue.message}` : issue.message];
		});
		return lines.length > 0 ? lines.join("; ") : null;
	} catch {
		return null;
	}
};

/** One sentence for a failed call, as specific as the server allows. */
export const describeError = (error: unknown): string => {
	const err = asErrorLike(error);
	if (!err) return GENERIC;
	if (err.status === 429 || err.code === "TOO_MANY_REQUESTS") {
		return "Too many requests. Wait a moment and try again.";
	}
	const access = accessStateOf(err);
	if (access === "SIGNED_OUT") return "You are signed out. Sign in again.";
	if (access === "NOT_SUPER_ADMIN") return "This account may not do this.";
	const fromFields = joinFieldErrors(err.data);
	if (fromFields) return fromFields;
	if (typeof err.message !== "string" || err.message === "") return GENERIC;
	if (err.status === 500 || err.code === "INTERNAL_SERVER_ERROR") return GENERIC;
	return joinIssueMessage(err.message) ?? err.message;
};
