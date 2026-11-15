import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { isIP } from "node:net";
import { isBlockedAddress } from "@backend/modules/webhook_calls/handlers/ssrf_guard.utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmationFor, isConfirmationValid } from "./confirmation.user_mcp.service";
import { FetchRefusal, fetchRemoteFile } from "./fetch_remote.user_mcp.service";
import { platformOf } from "./platform.user_mcp.service";

let server: Server;
let origin: string;

beforeAll(async () => {
	server = createServer((req, res) => {
		if (req.url === "/redirect-inside") {
			res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
			res.end();
			return;
		}
		if (req.url === "/big") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(Buffer.alloc(2048));
			return;
		}
		res.writeHead(200, {
			"content-type": "application/json",
			"content-disposition": 'attachment; filename="client.json"',
		});
		res.end(Buffer.from("{}"));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Remote documents (SSRF guard)", () => {
	it("blocks private, loopback, link-local, metadata and mapped addresses", () => {
		const blocked = (address: string) => isBlockedAddress(address, isIP(address));
		for (const address of [
			"127.0.0.1",
			"10.1.2.3",
			"172.20.0.1",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"0.0.0.0",
			"::1",
			"fd00::1",
			"fe80::1",
			"::ffff:10.0.0.1",
		]) {
			expect(blocked(address), address).toBe(true);
		}
		for (const address of ["8.8.8.8", "142.250.183.14", "2606:4700:4700::1111"]) {
			expect(blocked(address), address).toBe(false);
		}
	});

	it("refuses a link to this machine, by address or by name, and one that redirects inside", async () => {
		await expect(fetchRemoteFile(`${origin}/x.json`, 1024)).rejects.toBeInstanceOf(FetchRefusal);
		await expect(fetchRemoteFile("http://127.0.0.1/x.json", 1024)).rejects.toThrow(
			"private network",
		);
		await expect(fetchRemoteFile("http://[::1]/x.json", 1024)).rejects.toThrow("private network");
		await expect(fetchRemoteFile("http://169.254.169.254/latest", 1024)).rejects.toThrow(
			"private network",
		);
		// A name is checked on the addresses the socket connects to.
		await expect(fetchRemoteFile("http://localhost/x.json", 1024)).rejects.toThrow(
			"private network",
		);
		await expect(
			fetchRemoteFile(`${origin}/redirect-inside`, 1024, { allowPrivate: true, timeoutMs: 2000 }),
		).rejects.toBeInstanceOf(FetchRefusal);
		await expect(fetchRemoteFile("ftp://example.com/x.json", 1024)).rejects.toThrow(
			"http and https",
		);
		await expect(fetchRemoteFile("https://example.com:8443/x.json", 1024)).rejects.toThrow(
			"standard ports",
		);
	});

	it("reads a file with its name, and stops at the size cap", async () => {
		const fetched = await fetchRemoteFile(`${origin}/x`, 1024, { allowPrivate: true });
		expect(fetched.fileName).toBe("client.json");
		expect(fetched.bytes.toString()).toBe("{}");
		await expect(fetchRemoteFile(`${origin}/big`, 1024, { allowPrivate: true })).rejects.toThrow(
			"larger than",
		);
	});
});

describe("Platforms", () => {
	it("names a known platform by where it signs in back to, never by the name it gives", () => {
		expect(
			platformOf({ name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] }),
		).toMatchObject({ platform: "Claude", isKnownPlatform: true });
		expect(
			platformOf({
				name: null,
				redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
			}).platform,
		).toBe("ChatGPT");
		expect(
			platformOf({ name: "Claude", redirectUris: ["https://claude.ai.evil.example/cb"] }),
		).toMatchObject({ platform: "Claude", isKnownPlatform: false, host: "claude.ai.evil.example" });
		expect(
			platformOf({ name: "Claude Code", redirectUris: ["http://localhost:33418/callback"] }),
		).toMatchObject({ platform: "Claude Code", host: "this computer" });
		expect(
			platformOf({
				name: null,
				redirectUris: ["cursor://anysphere.cursor-retrieval/oauth/callback"],
			}).platform,
		).toBe("Cursor");
	});
});

describe("Confirmation codes", () => {
	const binding = {
		action: "create_journal_entry",
		userId: "u1",
		clientId: "c1",
		args: { content: "Hello", teamId: "t1", entryId: "e1" },
	};

	it("binds a confirmation to the exact arguments, person, app and ten minutes", () => {
		const code = confirmationFor(binding, 1_000);
		expect(isConfirmationValid(code, binding, 2_000)).toBe(true);
		expect(
			isConfirmationValid(
				code,
				{ ...binding, args: { ...binding.args, content: "Hello!" } },
				2_000,
			),
		).toBe(false);
		expect(isConfirmationValid(code, { ...binding, userId: "u2" }, 2_000)).toBe(false);
		expect(isConfirmationValid(code, { ...binding, clientId: "c2" }, 2_000)).toBe(false);
		expect(isConfirmationValid(code, binding, 1_000 + 11 * 60 * 1000)).toBe(false);
		expect(isConfirmationValid("garbage", binding, 2_000)).toBe(false);
	});
});
