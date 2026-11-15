import { describe, expect, it } from "vitest";
import { getClientIpAddress, resolveClientIp, stampClientIp } from "./client-info.utils";

describe("resolveClientIp", () => {
	it("1 proxy: the entry one place left of the peer; a spoofed left-most value is ignored", () => {
		// What the app's nginx sends: exactly one address, from the nginx peer.
		expect(resolveClientIp("203.0.113.9", "172.18.0.3", 1)).toBe("203.0.113.9");
		// A proxy that appended to a client-sent header.
		expect(resolveClientIp("6.6.6.6, 203.0.113.9", "10.0.0.5", 1)).toBe("203.0.113.9");
		expect(resolveClientIp("1.2.3.4, 203.0.113.9", "10.0.0.5", 1)).not.toBe("1.2.3.4");
		expect(resolveClientIp("1.1.1.1, 203.0.113.9, 10.0.0.2", "10.0.0.3", 2)).toBe("203.0.113.9");
	});
	it("0 proxies: the socket address; the header (spoofed or not) is ignored", () => {
		expect(resolveClientIp("6.6.6.6", "::ffff:203.0.113.9", 0)).toBe("203.0.113.9");
		expect(resolveClientIp(undefined, "203.0.113.9", 0)).toBe("203.0.113.9");
	});
	it("fewer entries than proxies: the left-most entry, else the socket", () => {
		expect(resolveClientIp("203.0.113.9", "10.0.0.5", 2)).toBe("203.0.113.9");
		expect(resolveClientIp(undefined, "198.51.100.7", 1)).toBe("198.51.100.7");
	});
	it("refuses a non-address", () => {
		expect(resolveClientIp("garbage, nonsense", "10.0.0.5", 1)).toBeNull();
	});
});

describe("getClientIpAddress", () => {
	it("never reads X-Forwarded-For or X-Real-IP", () => {
		const headers = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4" });
		expect(getClientIpAddress(headers)).toBe("127.0.0.1"); // NODE_ENV=test fallback
	});
	it("reads the stamped address", () => {
		expect(getClientIpAddress(new Headers({ "x-client-ip": "203.0.113.9" }))).toBe("203.0.113.9");
	});
});

describe("stampClientIp", () => {
	it("drops a client-sent x-client-ip", () => {
		const req = {
			headers: { "x-client-ip": "1.2.3.4", "x-forwarded-for": "1.2.3.4" } as Record<string, string>,
			socket: { remoteAddress: "203.0.113.9" },
		};
		stampClientIp(req); // TRUSTED_PROXY_COUNT=0 in tests: the peer
		expect(req.headers["x-client-ip"]).toBe("203.0.113.9");
	});
});
