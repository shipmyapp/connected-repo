import { describe, expect, it } from "vitest";
import {
	authorizeQueryOf,
	authorizeUrl,
	isOAuthRequest,
	oauthResumeQuery,
	peekPendingOAuth,
	rememberOAuth,
	takePendingOAuth,
} from "./pending-oauth";

const memoryStorage = () => {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
	};
};

const signed = (exp: number) =>
	new URLSearchParams({
		response_type: "code",
		client_id: "abc",
		redirect_uri: "https://claude.ai/api/mcp/auth_callback",
		scope: "read write",
		code_challenge: "xyz",
		code_challenge_method: "S256",
		state: "s",
		exp: String(exp),
		sig: "signature",
	});

describe("pending OAuth request", () => {
	it("recognises a signed authorize request and drops the signature for the resume", () => {
		const params = signed(2_000);
		expect(isOAuthRequest(params)).toBe(true);
		expect(isOAuthRequest(new URLSearchParams("error=x"))).toBe(false);
		const query = new URLSearchParams(authorizeQueryOf(params));
		expect(query.has("sig")).toBe(false);
		expect(query.has("exp")).toBe(false);
		expect(query.get("client_id")).toBe("abc");
	});

	it("drops the prompt for the sign-in just done, and keeps the rest", () => {
		const params = signed(2_000);
		params.set("prompt", "login consent");
		expect(new URLSearchParams(authorizeQueryOf(params)).get("prompt")).toBe("consent");
		params.set("prompt", "create");
		expect(new URLSearchParams(authorizeQueryOf(params)).has("prompt")).toBe(false);
	});

	it("is peeked freely, taken once, and not after it expires", () => {
		const storage = memoryStorage();
		rememberOAuth(signed(2_000), 1_000_000, storage);
		expect(peekPendingOAuth(1_500_000, storage)).not.toBeNull();
		expect(takePendingOAuth(1_500_000, storage)).toContain("client_id=abc");
		expect(takePendingOAuth(1_500_000, storage)).toBeNull();
		rememberOAuth(signed(2_000), 1_000_000, storage);
		expect(takePendingOAuth(2_500_000, storage)).toBeNull();
	});

	it("resumes from the address first, then from storage", () => {
		const storage = memoryStorage();
		expect(oauthResumeQuery(signed(2_000), 1_000_000, storage)).toContain("client_id=abc");
		expect(oauthResumeQuery(new URLSearchParams(), 1_000_000, storage)).toBeNull();
		rememberOAuth(signed(2_000), 1_000_000, storage);
		expect(oauthResumeQuery(new URLSearchParams(), 1_500_000, storage)).toContain("client_id=abc");
	});

	it("builds the authorize URL on the API base", () => {
		expect(authorizeUrl("https://app.example.com/", "a=1")).toBe(
			"https://app.example.com/api/auth/oauth2/authorize?a=1",
		);
	});
});
