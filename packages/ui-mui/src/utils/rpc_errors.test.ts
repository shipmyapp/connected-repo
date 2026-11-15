import { describe, expect, it } from "vitest";
import { accessStateOf, describeError, isAccessError } from "./rpc_errors";

// Shaped like oRPC's ORPCError (code, status, message, data): the helpers duck-type.
class ORPCError extends Error {
	code: string;
	status: number;
	data: unknown;
	constructor(code: string, options: { status: number; message?: string; data?: unknown }) {
		super(options.message ?? "");
		this.code = code;
		this.status = options.status;
		this.data = options.data;
	}
}

describe("accessStateOf", () => {
	it("reads a 401 as signed out and a 403 as refused", () => {
		expect(accessStateOf(new ORPCError("UNAUTHORIZED", { status: 401 }))).toBe("SIGNED_OUT");
		expect(accessStateOf(new ORPCError("FORBIDDEN", { status: 403 }))).toBe("NOT_SUPER_ADMIN");
	});

	it("leaves every other failure alone", () => {
		expect(accessStateOf(new ORPCError("BAD_REQUEST", { status: 400 }))).toBeNull();
		expect(accessStateOf(new Error("network"))).toBeNull();
		expect(accessStateOf("nope")).toBeNull();
		expect(isAccessError(null)).toBe(false);
	});
});

describe("describeError", () => {
	it("joins the field errors of a refused input", () => {
		const error = new ORPCError("BAD_REQUEST", {
			status: 400,
			message: "Validation failed",
			data: { fieldErrors: { reason: ["Too small"] }, formErrors: ["Bad form"] },
		});
		expect(describeError(error)).toBe("reason: Too small; Bad form");
	});

	it("unpacks a schema error passed through as the message", () => {
		const message = JSON.stringify([
			{ code: "too_small", path: [], message: "Too small: expected number to be >=0" },
			{ code: "invalid_type", path: [0, "credits"], message: "Expected number" },
		]);
		expect(describeError(new ORPCError("BAD_REQUEST", { status: 400, message }))).toBe(
			"Too small: expected number to be >=0; 0.credits: Expected number",
		);
	});

	it("keeps a plain server sentence and hides internal errors", () => {
		expect(
			describeError(new ORPCError("NOT_FOUND", { status: 404, message: "No such account." })),
		).toBe("No such account.");
		expect(
			describeError(new ORPCError("INTERNAL_SERVER_ERROR", { status: 500, message: "boom" })),
		).toBe("Something went wrong. Try again.");
	});

	it("names the rate limit and the gate", () => {
		expect(describeError(new ORPCError("TOO_MANY_REQUESTS", { status: 429 }))).toMatch(
			/Too many requests/,
		);
		expect(describeError(new ORPCError("FORBIDDEN", { status: 403 }))).toBe(
			"This account may not do this.",
		);
	});
});
