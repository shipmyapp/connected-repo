import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { LOG_REDACT_PATHS } from "./logger.utils";

describe("log redaction", () => {
	it("censors credentials and keeps error codes", () => {
		const lines: string[] = [];
		const stream = new Writable({
			write(chunk, _encoding, done) {
				lines.push(chunk.toString());
				done();
			},
		});
		const log = pino({ redact: { paths: LOG_REDACT_PATHS, censor: "[redacted]" } }, stream);
		log.info(
			{
				tool: "journal_search",
				input: { request: "what did I write about my doctor" },
				password: "p",
				user: { token: "t" },
				req: { headers: { cookie: "c", authorization: "Bearer x", "x-api-key": "k" } },
				err: { code: "23505" },
				mcp: { tool: "whoami", request: "secret text" },
				tokens: { access_token: "a", refresh_token: "r" },
				oauthRegistration: { client_secret: "s", clientId: "c" },
			},
			"line",
		);
		const out = JSON.parse(lines[0] ?? "{}");
		expect(out.password).toBe("[redacted]");
		expect(out.user.token).toBe("[redacted]");
		expect(out.req.headers.cookie).toBe("[redacted]");
		expect(out.req.headers.authorization).toBe("[redacted]");
		expect(out.req.headers["x-api-key"]).toBe("[redacted]");
		expect(out.input.request).toBe("[redacted]");
		expect(out.mcp.request).toBe("[redacted]");
		expect(out.mcp.tool).toBe("whoami");
		expect(out.tokens.access_token).toBe("[redacted]");
		expect(out.tokens.refresh_token).toBe("[redacted]");
		expect(out.oauthRegistration.client_secret).toBe("[redacted]");
		expect(out.oauthRegistration.clientId).toBe("c");
		expect(out.tool).toBe("journal_search");
		expect(out.err.code).toBe("23505");
	});
});
