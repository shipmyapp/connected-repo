import { describe, expect, it } from "vitest";
import { applyApiSecurityHeaders } from "./security_headers.utils";

describe("applyApiSecurityHeaders", () => {
	const collect = (url: string) => {
		const headers = new Map<string, string>();
		applyApiSecurityHeaders({ setHeader: (name, value) => headers.set(name, value) }, url);
		return headers;
	};
	it("sets the base headers everywhere and no-store on auth", () => {
		const api = collect("/api/user-app/x");
		expect(api.get("X-Content-Type-Options")).toBe("nosniff");
		expect(api.get("X-Frame-Options")).toBe("DENY");
		expect(api.get("Referrer-Policy")).toBe("no-referrer");
		expect(api.has("Cache-Control")).toBe(false);
		expect(collect("/api/auth/get-session").get("Cache-Control")).toBe("no-store");
	});
});
