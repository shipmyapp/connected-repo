import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { reactAppHandler } from "@backend/request_handlers/user_app.handler";
import { describe, expect, it } from "vitest";
import { APP_BODY_LIMIT_BYTES, bodyLimitFor, declaresTooLargeBody } from "./body_limit.utils";

describe("body limits", () => {
	it("chooses the limit by route", () => {
		expect(bodyLimitFor("/api/auth/sign-in/social")).toBe(64 * 1024);
		expect(bodyLimitFor("/api/user-app/journalEntries/pushCreates")).toBe(APP_BODY_LIMIT_BYTES);
		expect(bodyLimitFor("/mobile-app/journalEntries/pushCreates")).toBe(APP_BODY_LIMIT_BYTES);
		expect(bodyLimitFor("/api/v1/journal-entries/create-request")).toBe(1024 * 1024);
	});

	it("refuses a declared length over the limit", () => {
		expect(declaresTooLargeBody({ "content-length": "70000" }, "/api/auth/x")).toBe(true);
		expect(declaresTooLargeBody({ "content-length": "1000" }, "/api/auth/x")).toBe(false);
		expect(declaresTooLargeBody({}, "/api/auth/x")).toBe(false);
	});

	it("the app handler cuts an oversized body with 413", async () => {
		const server = createServer((req, res) => {
			void reactAppHandler.handle(req, res, { prefix: "/api/user-app", context: {} });
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		try {
			const res = await fetch(`http://127.0.0.1:${port}/api/user-app/prompts/getById`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: Buffer.alloc(APP_BODY_LIMIT_BYTES + 1024, 0x20),
			});
			expect(res.status).toBe(413);
		} finally {
			// fetch keeps the connection alive; close() alone would wait for it.
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		}
	});
});
