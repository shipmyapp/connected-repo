import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { handleBoundaryError } from "./errorParser";

const parse = (error: unknown) => handleBoundaryError(error, "test");

describe("handleBoundaryError", () => {
	it("keeps a refusal oRPC raised with its own status, rather than calling it a server fault", () => {
		const csrf = new ORPCError("CSRF_TOKEN_MISMATCH", {
			status: 403,
			message: "Invalid CSRF token",
		});
		expect(parse(csrf).status).toBe(403);
	});

	it("maps the codes it knows, and leaves an unknown code without a refusal status at 500", () => {
		expect(parse(new ORPCError("CONFLICT", { message: "short" })).status).toBe(409);
		expect(parse(new ORPCError("SOMETHING_ODD", { status: 500 })).status).toBe(500);
	});

	it("names the first field that failed input validation", () => {
		// The shape oRPC's ValidationError has on the input pipeline.
		const invalid = Object.assign(new Error("Input validation failed"), {
			name: "ValidationError",
			issues: [{ path: ["timezone"], message: "Use an IANA time zone" }],
		});
		const result = parse(invalid);
		expect(result.status).toBe(400);
		expect(result.message).toBe("timezone: Use an IANA time zone");
	});

	it("carries the message of an uncaught error outside production (tests run with NODE_ENV=test)", () => {
		expect(parse(new Error("Invalid time zone specified: UZT")).message).toBe(
			"An unexpected error occurred: Invalid time zone specified: UZT",
		);
	});

	it("never echoes the text of a Postgres error", () => {
		const pgError = Object.assign(
			new Error('invalid input syntax for type integer: "secret-value"'),
			{ code: "22P02" },
		);
		const result = parse(pgError);
		expect(result.status).toBe(500);
		expect(result.message).toBe("An unexpected error occurred");
	});
});
