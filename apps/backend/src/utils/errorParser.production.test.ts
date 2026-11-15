import { afterEach, describe, expect, it, vi } from "vitest";

// errorParser reads `isProd` when its module loads; load a fresh copy with
// production switched on.
const loadProductionParser = async () => {
	vi.resetModules();
	vi.doMock("@backend/configs/env.config", async (importOriginal) => {
		const original = await importOriginal<typeof import("@backend/configs/env.config")>();
		return { ...original, isProd: true };
	});
	return await import("./errorParser.js");
};

describe("handleBoundaryError in production", () => {
	afterEach(() => {
		vi.doUnmock("@backend/configs/env.config");
		vi.resetModules();
	});

	it("answers an uncaught error with the fixed sentence, never its text", async () => {
		const { handleBoundaryError } = await loadProductionParser();
		const result = handleBoundaryError(new Error("getaddrinfo ENOTFOUND minio"), "test");
		expect(result.status).toBe(500);
		expect(result.message).toBe("An unexpected error occurred");
	});

	it("still names the field that failed validation and keeps a refusal's status", async () => {
		const { handleBoundaryError } = await loadProductionParser();
		const invalid = Object.assign(new Error("Input validation failed"), {
			name: "ValidationError",
			issues: [{ path: ["timezone"], message: "Use an IANA time zone" }],
		});
		expect(handleBoundaryError(invalid, "test").message).toBe("timezone: Use an IANA time zone");
		const { ORPCError } = await import("@orpc/server");
		const csrf = new ORPCError("CSRF_TOKEN_MISMATCH", {
			status: 403,
			message: "Invalid CSRF token",
		});
		expect(handleBoundaryError(csrf, "test").status).toBe(403);
	});
});
