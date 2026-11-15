import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mainRequestDispatcher } from "@backend/request_handlers/main.handler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let base: string;

beforeAll(async () => {
	server = createServer((req, res) => {
		void mainRequestDispatcher(req, res);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /robots.txt on the API host", () => {
	it("disallows everything and keeps the API's security headers", async () => {
		const res = await fetch(`${base}/robots.txt`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
		expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});

	it("answers only GET", async () => {
		const res = await fetch(`${base}/robots.txt`, { method: "POST" });
		expect(res.status).not.toBe(200);
	});
});
