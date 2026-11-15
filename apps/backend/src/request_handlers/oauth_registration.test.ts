import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { checkAndRecordRateLimit } from "@backend/modules/system/services/rate_limit.service";
import {
	MAX_OAUTH_CLIENTS,
	REGISTRATIONS_PER_DAY,
	userMcpResourceUrl,
} from "@backend/modules/user_mcp/oauth.user_mcp.config";
import { mainRequestDispatcher } from "@backend/request_handlers/main.handler";
import { defaultContext } from "@backend/test/setup";
import { clearRateLimit } from "@backend/test/utils/rate_limit.utils";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registrationBodyFor } from "./oauth_registration.handler";

/**
 * Claude registers as a confidential client (`client_secret_post`) before
 * anyone has signed in; Better Auth's own endpoint refused that and Claude
 * could not connect (2026-11-09). Registration now goes through our handler.
 */
const API = env.VITE_API_URL.replace(/\/+$/, "");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

/** A client address no other run shares, so the per-IP bucket starts empty. */
const freshIp = () => `2001:db8::${randomBytes(6).toString("hex").match(/.{4}/g)?.join(":")}`;

let server: Server;
let base: string;
const trustedProxiesBefore = env.TRUSTED_PROXY_COUNT;

beforeAll(async () => {
	// One trusted proxy: the X-Forwarded-For each request sends is its client.
	env.TRUSTED_PROXY_COUNT = 1;
	server = createServer((req, res) => {
		void mainRequestDispatcher(req, res);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
	// The daily total is shared by every run against this Redis.
	await clearRateLimit("oauth-register:all");
});

afterAll(async () => {
	env.TRUSTED_PROXY_COUNT = trustedProxiesBefore;
	await clearRateLimit("oauth-register:all");
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

const register = (body: Record<string, unknown>, ip = freshIp()) =>
	fetch(`${base}/api/auth/oauth2/register`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-forwarded-for": ip },
		body: JSON.stringify(body),
	});

const claudeLike = {
	client_name: "Claude",
	redirect_uris: [REDIRECT],
	grant_types: ["authorization_code", "refresh_token"],
	response_types: ["code"],
	token_endpoint_auth_method: "client_secret_post",
};

const cookie = () => defaultContext?.reqHeaders.get("cookie") ?? "";

const authFetch = (path: string, init: RequestInit = {}) => {
	const headers = new Headers(init.headers);
	headers.set("cookie", cookie());
	headers.set("origin", env.WEBAPP_URL);
	return auth.handler(new Request(`${API}/api/auth${path}`, { ...init, headers }));
};

describe("Connected apps: registration (RFC 7591)", () => {
	it("registers a confidential client without a session, as Claude does, and it signs in with its secret", async () => {
		const response = await register(claudeLike);
		expect(response.status).toBe(201);
		const client = (await response.json()) as {
			client_id: string;
			client_secret: string;
			token_endpoint_auth_method: string;
		};
		expect(client.client_secret.startsWith("oneq_cs_")).toBe(true);
		expect(client.token_endpoint_auth_method).toBe("client_secret_post");
		const row = await db.oauthClients.where({ clientId: client.client_id }).take();
		expect(row.requirePKCE).toBe(true);
		expect(row.skipConsent).toBeFalsy();

		const verifier = randomBytes(32).toString("base64url");
		const query = new URLSearchParams({
			response_type: "code",
			client_id: client.client_id,
			redirect_uri: REDIRECT,
			scope: "read write offline_access",
			state: "s",
			code_challenge: createHash("sha256").update(verifier).digest("base64url"),
			code_challenge_method: "S256",
			resource: userMcpResourceUrl(),
		});
		const consentUrl = new URL(
			(await authFetch(`/oauth2/authorize?${query}`, { redirect: "manual" })).headers.get(
				"location",
			) ?? "",
		);
		expect(consentUrl.pathname).toBe("/oauth/consent");
		const consent = await authFetch("/oauth2/consent", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				accept: true,
				oauth_query: consentUrl.search.slice(1),
			}),
		});
		const code =
			new URL(((await consent.json()) as { url: string }).url).searchParams.get("code") ?? "";
		const exchange = (secret: string) =>
			authFetch("/oauth2/token", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: REDIRECT,
					client_id: client.client_id,
					code_verifier: verifier,
					resource: userMcpResourceUrl(),
					client_secret: secret,
				}),
			});
		const tokens = await exchange(client.client_secret);
		expect(tokens.status).toBe(200);
		const issued = (await tokens.json()) as {
			access_token: string;
			refresh_token: string;
		};
		expect(issued.access_token.startsWith("oneq_at_")).toBe(true);
		// The secret is checked: a refresh with the wrong one is refused.
		const refresh = await authFetch("/oauth2/token", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: issued.refresh_token,
				client_id: client.client_id,
				client_secret: "oneq_cs_wrong",
			}),
		});
		expect(refresh.status).toBeGreaterThanOrEqual(400);
	});

	it("still registers public clients", async () => {
		const response = await register({
			...claudeLike,
			token_endpoint_auth_method: "none",
		});
		expect(response.status).toBe(201);
		expect(((await response.json()) as { client_secret?: string }).client_secret).toBeUndefined();
	});

	it("ignores what only an operator may set, and refuses other grants and scopes", async () => {
		const sneaky = await register({
			...claudeLike,
			skip_consent: true,
			require_pkce: false,
			type: "web",
		});
		expect(sneaky.status).toBe(201);
		const { client_id } = (await sneaky.json()) as { client_id: string };
		const row = await db.oauthClients.where({ clientId: client_id }).take();
		expect(row.skipConsent).toBeFalsy();
		expect(row.requirePKCE).toBe(true);

		expect((await register({ ...claudeLike, grant_types: ["client_credentials"] })).status).toBe(
			400,
		);
		expect((await register({ ...claudeLike, scope: "read admin" })).status).toBe(400);
		expect((await register({ client_name: "No redirect" })).status).toBe(400);
	});

	it("reduces the request to the metadata an app may choose", () => {
		const result = registrationBodyFor({
			...claudeLike,
			skip_consent: true,
			scope: "read",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body).not.toHaveProperty("skip_consent");
		expect(result.body.require_pkce).toBe(true);
		expect(result.body.scope).toBe("read");
		expect(registrationBodyFor({ ...claudeLike, grant_types: ["refresh_token"] }).ok).toBe(false);
	});

	it("accepts only https or loopback http redirect URIs with a port, without fragment or userinfo", async () => {
		for (const uri of [
			"javascript:alert(1)//",
			"http://evil.example/cb",
			"cursor://anysphere.cursor-retrieval/oauth/cb",
			"https://claude.ai/cb#frag",
			"https://user:pw@claude.ai/cb",
			"http://127.0.0.1/cb",
		]) {
			const response = await register({ ...claudeLike, redirect_uris: [uri] });
			expect(response.status, uri).toBe(400);
			expect(((await response.json()) as { error: string }).error, uri).toBe(
				"invalid_client_metadata",
			);
		}
		for (const uri of ["http://127.0.0.1:33418/cb", "http://[::1]:8080/cb", REDIRECT]) {
			expect((await register({ ...claudeLike, redirect_uris: [uri] })).status, uri).toBe(201);
		}
	});

	it("limits registrations per caller a minute", async () => {
		const ip = freshIp();
		const statuses: number[] = [];
		for (let i = 0; i < 11; i++) statuses.push((await register(claudeLike, ip)).status);
		expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
		expect(statuses[10]).toBe(429);
	});

	it("limits registrations in total a day", async () => {
		for (let i = 0; i < REGISTRATIONS_PER_DAY; i++) {
			await checkAndRecordRateLimit("oauth-register:all", REGISTRATIONS_PER_DAY, 86_400);
		}
		const response = await register(claudeLike);
		expect(response.status).toBe(429);
		expect(((await response.json()) as { error: string }).error).toBe("too_many_requests");
	});

	it("closes registration while the app limit is reached", async () => {
		await db.$query`
			INSERT INTO oauth_clients (id, client_id, redirect_uris)
			SELECT substr(md5(g::text), 1, 26), 'cap-' || g, ARRAY['https://cap.example/cb']
			FROM generate_series(1, ${MAX_OAUTH_CLIENTS}) g
		`;
		const response = await register(claudeLike);
		expect(response.status).toBe(503);
		expect(((await response.json()) as { error: string }).error).toBe("temporarily_unavailable");
	});
});
