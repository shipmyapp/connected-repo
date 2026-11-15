import { describe, expect, it } from "vitest";
import { consentRedirectTarget, isAcceptableRedirectUri } from "./redirect_uri.utils";

describe("isAcceptableRedirectUri", () => {
	it("accepts https and loopback http with a port", () => {
		for (const uri of [
			"https://claude.ai/api/mcp/auth_callback",
			"http://127.0.0.1:33418/cb",
			"http://[::1]:8080/cb",
			"http://localhost:6274/oauth/callback",
		]) {
			expect(isAcceptableRedirectUri(uri), uri).toBe(true);
		}
	});

	it("refuses other schemes, plain http elsewhere, no port, fragments and userinfo", () => {
		for (const uri of [
			"javascript:alert(1)//",
			"data:text/html,x",
			"file:///etc/passwd",
			"blob:https://a.example/x",
			"cursor://anysphere.cursor-retrieval/oauth/cb",
			"http://evil.example/cb",
			"http://127.0.0.1/cb",
			"https://claude.ai/cb#x",
			"https://claude.ai/cb#",
			"https://user:pw@claude.ai/cb",
			"not a url",
		]) {
			expect(isAcceptableRedirectUri(uri), uri).toBe(false);
		}
	});
});

describe("consentRedirectTarget", () => {
	const expected = "https://claude.ai/api/mcp/auth_callback";

	it("returns a URL on the request's own redirect URI", () => {
		const returned = "https://claude.ai/api/mcp/auth_callback?code=a&state=b";
		expect(consentRedirectTarget(returned, expected)).toBe(returned);
	});

	it("refuses another host, another path, another scheme or an unacceptable redirect URI", () => {
		expect(
			consentRedirectTarget("https://evil.example/api/mcp/auth_callback?code=a", expected),
		).toBeNull();
		expect(consentRedirectTarget("javascript:alert(1)", expected)).toBeNull();
		expect(consentRedirectTarget("https://claude.ai/other?code=a", expected)).toBeNull();
		expect(
			consentRedirectTarget("https://u:p@claude.ai/api/mcp/auth_callback", expected),
		).toBeNull();
		expect(consentRedirectTarget("javascript:alert(1)", "javascript:alert(1)")).toBeNull();
	});
});
