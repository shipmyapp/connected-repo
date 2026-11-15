import { createHash, randomBytes } from "node:crypto";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { env } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { tbus } from "@backend/events/tbus";
import { auth } from "@backend/modules/auth/auth.config";
import { createTeamService } from "@backend/modules/teams/services/create_team.teams.service";
import { mainRequestDispatcher } from "@backend/request_handlers/main.handler";
import { handleUserMcpRequest, userMcpRouteFor } from "@backend/request_handlers/user_mcp.handler";
import { userAppRouter } from "@backend/routers/user_app/user_app.router";
import { defaultContext } from "@backend/test/setup";
import { clearRateLimit } from "@backend/test/utils/rate_limit.utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRouterClient } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
	CIMD_FETCHES_PER_IP_PER_HOUR,
	MAX_OAUTH_CLIENTS,
	OAUTH_TOKEN_PREFIX,
	userMcpResourceUrl,
} from "./oauth.user_mcp.config";
import { principalFromBearer } from "./services/principal.user_mcp.service";

/**
 * Connected apps end to end (ADR-045): an app registers itself, the person
 * signs in and consents, the app exchanges the code with PKCE and calls the
 * application MCP over real HTTP, exactly as Claude or ChatGPT would.
 */
const API = env.VITE_API_URL.replace(/\/+$/, "");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

/** A client address no other run shares, so per-IP buckets start empty. */
const freshIp = () => `2001:db8::${randomBytes(6).toString("hex").match(/.{4}/g)?.join(":")}`;

let server: Server;
let base: URL;

beforeAll(async () => {
	server = createServer((req, res) => {
		void handleUserMcpRequest(req, res);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	base = new URL(`http://127.0.0.1:${port}`);
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

type Ctx = NonNullable<typeof defaultContext>;
const requireContext = (): Ctx => {
	if (!defaultContext) throw new Error("defaultContext not initialized");
	return defaultContext;
};

const authFetch = (path: string, init: RequestInit & { cookie?: string } = {}) => {
	const headers = new Headers(init.headers);
	if (init.cookie) headers.set("cookie", init.cookie);
	headers.set("origin", env.WEBAPP_URL);
	return auth.handler(new Request(`${API}/api/auth${path}`, { ...init, headers }));
};

const registerClient = async (body: Record<string, unknown> = {}) => {
	const response = await authFetch("/oauth2/register", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_name: "Claude",
			redirect_uris: [REDIRECT],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			...body,
		}),
	});
	return {
		status: response.status,
		body: (await response.json()) as { client_id: string } & Record<string, unknown>,
	};
};

const pkce = () => {
	const verifier = randomBytes(32).toString("base64url");
	return {
		verifier,
		challenge: createHash("sha256").update(verifier).digest("base64url"),
	};
};

/** Runs authorize → consent → token for the default user; returns the tokens. */
const connectApp = async (options: { scopes?: string; grant?: string } = {}) => {
	const ctx = requireContext();
	const cookie = ctx.reqHeaders.get("cookie") ?? "";
	const { body: client } = await registerClient();
	const { verifier, challenge } = pkce();
	const query = new URLSearchParams({
		response_type: "code",
		client_id: client.client_id,
		redirect_uri: REDIRECT,
		scope: options.scopes ?? "read write offline_access",
		state: "s1",
		code_challenge: challenge,
		code_challenge_method: "S256",
		resource: userMcpResourceUrl(),
	});
	const authorize = await authFetch(`/oauth2/authorize?${query}`, {
		cookie,
		redirect: "manual",
	});
	expect(authorize.status).toBe(302);
	const consentUrl = new URL(authorize.headers.get("location") ?? "");
	expect(`${consentUrl.origin}${consentUrl.pathname}`).toBe(`${env.WEBAPP_URL}/oauth/consent`);

	const consent = await authFetch("/oauth2/consent", {
		method: "POST",
		cookie,
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			accept: true,
			scope: options.grant,
			oauth_query: consentUrl.search.slice(1),
		}),
	});
	const { url } = (await consent.json()) as { url: string };
	const callback = new URL(url);
	expect(callback.origin + callback.pathname).toBe(REDIRECT);
	expect(callback.searchParams.get("state")).toBe("s1");

	const token = await authFetch("/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: callback.searchParams.get("code") ?? "",
			redirect_uri: REDIRECT,
			client_id: client.client_id,
			code_verifier: verifier,
			resource: userMcpResourceUrl(),
		}),
	});
	expect(token.status).toBe(200);
	const tokens = (await token.json()) as {
		access_token: string;
		refresh_token: string;
		scope: string;
	};
	return { clientId: client.client_id, ...tokens };
};

const mcpClient = async (bearer: string) => {
	const client = new Client({ name: "test", version: "0.0.0" });
	await client.connect(
		new StreamableHTTPClientTransport(new URL("/mcp", base), {
			requestInit: {
				headers: { Authorization: `Bearer ${bearer}`, "x-client-ip": freshIp() },
			},
		}),
	);
	return client;
};

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
	const result = await client.callTool({ name, arguments: args });
	const [first] = result.content as { type: string; text?: string }[];
	return {
		isError: result.isError === true,
		text: first?.text ?? "",
		data: (result.structuredContent ?? {}) as Record<string, unknown>,
	};
};

/** A raw tools/list on /mcp, for the status code a refused token gets. */
const listToolsRaw = (bearer: string) =>
	fetch(new URL("/mcp", base), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${bearer}`,
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			"x-client-ip": freshIp(),
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
	});

describe("Connected apps: discovery", () => {
	it("publishes the protected resource and the authorization server, open to any origin", async () => {
		const resource = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", base));
		expect(resource.status).toBe(200);
		expect(resource.headers.get("access-control-allow-origin")).toBe("*");
		const metadata = (await resource.json()) as Record<string, unknown>;
		expect(metadata.resource).toBe(userMcpResourceUrl());
		expect(metadata.authorization_servers).toEqual([`${API}/api/auth`]);

		const server = await fetch(new URL("/.well-known/oauth-authorization-server/api/auth", base));
		const as = (await server.json()) as Record<string, unknown>;
		expect(as.issuer).toBe(`${API}/api/auth`);
		expect(as.registration_endpoint).toBe(`${API}/api/auth/oauth2/register`);
		expect(as.code_challenge_methods_supported).toEqual(["S256"]);
		expect(as.grant_types_supported).not.toContain("client_credentials");
	});

	it("answers /mcp without a token with 401 and where to sign in", async () => {
		const response = await fetch(new URL("/mcp", base), {
			method: "POST",
			headers: { "x-client-ip": freshIp() },
			body: "{}",
		});
		expect(response.status).toBe(401);
		const challenge = response.headers.get("www-authenticate") ?? "";
		expect(challenge).toContain('resource_metadata="');
		expect(challenge).toContain("/.well-known/oauth-protected-resource/mcp");
		const wrong = await fetch(new URL("/mcp", base), {
			method: "POST",
			headers: { Authorization: "Bearer oneq_at_nope", "x-client-ip": freshIp() },
			body: "{}",
		});
		expect(wrong.status).toBe(401);
		expect(wrong.headers.get("www-authenticate")).toContain('error="invalid_token"');
	});

	it("never reads a session cookie on /mcp", async () => {
		const response = await fetch(new URL("/mcp", base), {
			method: "POST",
			headers: {
				cookie: requireContext().reqHeaders.get("cookie") ?? "",
				"content-type": "application/json",
				"x-client-ip": freshIp(),
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		});
		expect(response.status).toBe(401);
	});
});

describe("Connected apps: sign-in", () => {
	it("lets an app register itself only as a public client, and requires PKCE", async () => {
		const confidential = await registerClient({
			token_endpoint_auth_method: "client_secret_post",
		});
		expect(confidential.status).toBe(401);
		const { body: client } = await registerClient();
		const query = new URLSearchParams({
			response_type: "code",
			client_id: client.client_id,
			redirect_uri: REDIRECT,
			scope: "read",
		});
		const cookie = requireContext().reqHeaders.get("cookie") ?? "";
		const authorize = await authFetch(`/oauth2/authorize?${query}`, {
			cookie,
			redirect: "manual",
		});
		expect(authorize.headers.get("location")).toContain("error=invalid_request");
	});

	it("issues prefixed, hashed tokens bound to the MCP resource", async () => {
		const tokens = await connectApp();
		expect(tokens.access_token.startsWith(OAUTH_TOKEN_PREFIX.opaqueAccessToken)).toBe(true);
		expect(tokens.refresh_token.startsWith(OAUTH_TOKEN_PREFIX.refreshToken)).toBe(true);
		const stored = await db.oauthAccessTokens.where({ clientId: tokens.clientId }).pluck("token");
		expect(stored).toHaveLength(1);
		expect(stored[0]).not.toContain(
			tokens.access_token.slice(OAUTH_TOKEN_PREFIX.opaqueAccessToken.length),
		);
	});

	it("refuses a code for another resource, or without the right verifier", async () => {
		const exchange = async (resource: string, wrongVerifier: boolean) => {
			const { body: client } = await registerClient();
			const { verifier, challenge } = pkce();
			const query = new URLSearchParams({
				response_type: "code",
				client_id: client.client_id,
				redirect_uri: REDIRECT,
				scope: "read",
				code_challenge: challenge,
				code_challenge_method: "S256",
			});
			const cookie = requireContext().reqHeaders.get("cookie") ?? "";
			const consentUrl = new URL(
				(
					await authFetch(`/oauth2/authorize?${query}`, {
						cookie,
						redirect: "manual",
					})
				).headers.get("location") ?? "",
			);
			const consent = await authFetch("/oauth2/consent", {
				method: "POST",
				cookie,
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					accept: true,
					oauth_query: consentUrl.search.slice(1),
				}),
			});
			const code =
				new URL(((await consent.json()) as { url: string }).url).searchParams.get("code") ?? "";
			return authFetch("/oauth2/token", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: REDIRECT,
					client_id: client.client_id,
					code_verifier: wrongVerifier ? `${verifier}x` : verifier,
					resource,
				}),
			});
		};
		expect((await exchange("https://evil.example/mcp", false)).status).toBe(400);
		expect((await exchange(userMcpResourceUrl(), true)).status).toBeGreaterThanOrEqual(400);
		expect((await exchange(userMcpResourceUrl(), false)).status).toBe(200);
	});

	it("rotates refresh tokens and refuses a reused one", async () => {
		const tokens = await connectApp();
		const refresh = (refreshToken: string) =>
			authFetch("/oauth2/token", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "refresh_token",
					refresh_token: refreshToken,
					client_id: tokens.clientId,
				}),
			});
		const first = await refresh(tokens.refresh_token);
		expect(first.status).toBe(200);
		const rotated = (await first.json()) as { refresh_token: string };
		expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
		expect((await refresh(tokens.refresh_token)).status).toBe(400);
	});

	it("accepts a token only for the MCP resource it was issued for", async () => {
		const tokens = await connectApp();
		expect(await principalFromBearer(tokens.access_token, "https://other.example/api")).toBe(
			"audience",
		);
		const principal = await principalFromBearer(tokens.access_token, userMcpResourceUrl());
		expect(typeof principal === "object" && principal.clientId).toBe(tokens.clientId);
	});
});

describe("Connected apps: the application MCP", () => {
	it("shows only the tools the person allowed", async () => {
		const tokens = await connectApp({ grant: "read offline_access" });
		const client = await mcpClient(tokens.access_token);
		const names = (await client.listTools()).tools.map((tool) => tool.name);
		expect(names).toEqual(
			expect.arrayContaining([
				"whoami",
				"list_teams",
				"list_team_members",
				"list_journal_entries",
				"get_journal_entry",
				"list_prompts",
			]),
		);
		expect(names).not.toContain("create_journal_entry");
		// Calling it anyway is refused, and nothing is saved.
		const refused = await call(client, "create_journal_entry", { content: "Sneaky." });
		expect(refused.isError).toBe(true);
	});

	it("names the person and their open team", async () => {
		const tokens = await connectApp();
		const client = await mcpClient(tokens.access_token);
		const me = await call(client, "whoami");
		expect(me.isError).toBe(false);
		expect(me.data.openTeamId).toBe(requireContext().user.activeTeamAppId);
		expect(me.data.connection).toEqual({ scopes: ["read", "write"] });
	});

	it("saves a journal entry only after the preview's confirmation, once, in the open team, with the fan-out and a record", async () => {
		const ctx = requireContext();
		const tokens = await connectApp();
		const client = await mcpClient(tokens.access_token);
		const args = { content: "Walked by the river.", request: "note my walk" };
		const preview = await call(client, "create_journal_entry", args);
		expect(preview.data.saved).toBe(false);
		const entryId = preview.data.entryId as string;
		expect(await db.journalEntries.unscope("default").findOptional(entryId)).toBeUndefined();

		// The entry id alone, without the code, saves nothing.
		const noCode = await call(client, "create_journal_entry", { ...args, entryId });
		expect(noCode.data.saved).toBe(false);

		// A code for other arguments saves nothing.
		const other = await call(client, "create_journal_entry", {
			...args,
			content: "Something else.",
			entryId,
			confirmation: preview.data.confirmation,
		});
		expect(other.data.saved).toBe(false);
		expect(await db.journalEntries.unscope("default").findOptional(entryId)).toBeUndefined();

		const saved = await call(client, "create_journal_entry", {
			...args,
			entryId,
			confirmation: preview.data.confirmation,
		});
		expect(saved.data.saved).toBe(true);
		const row = await db.journalEntries.unscope("default").find(entryId);
		expect(row).toMatchObject({
			authorUserId: ctx.user.id,
			teamId: ctx.user.activeTeamAppId,
			content: args.content,
		});
		expect(typeof row.updatedAt).toBe("string"); // µs string for pull-delta
		expect(vi.mocked(tbus.send)).toHaveBeenCalled();

		// The same save again is the same row, and not recorded twice.
		const again = await call(client, "create_journal_entry", {
			...args,
			entryId,
			confirmation: preview.data.confirmation,
		});
		expect(again.data.alreadySaved).toBe(true);
		const actions = await db.connectedAppActions.where({
			userId: ctx.user.id,
			clientId: tokens.clientId,
		});
		expect(actions).toHaveLength(1);
		expect(actions[0]).toMatchObject({
			tool: "create_journal_entry",
			entityId: entryId,
			request: "note my walk",
		});
	});

	it("works in another of the person's teams without switching the open team, and refuses a team they are not in", async () => {
		const ctx = requireContext();
		const other = await createTeamService(ctx.user.id, ctx.user.email, ctx.user.phoneNumber, {
			name: "Side project",
		});
		const tokens = await connectApp();
		const client = await mcpClient(tokens.access_token);
		const preview = await call(client, "create_journal_entry", {
			content: "Kick-off notes.",
			teamId: other.id,
		});
		const saved = await call(client, "create_journal_entry", {
			content: "Kick-off notes.",
			teamId: other.id,
			entryId: preview.data.entryId,
			confirmation: preview.data.confirmation,
		});
		expect(saved.data.saved).toBe(true);
		const row = await db.journalEntries.unscope("default").find(preview.data.entryId as string);
		expect(row.teamId).toBe(other.id);
		const user = await db.users.find(ctx.user.id);
		expect(user.activeTeamAppId).toBe(ctx.user.activeTeamAppId);

		const listed = await call(client, "list_journal_entries", { teamId: other.id });
		expect((listed.data.entries as { id: string }[]).map((entry) => entry.id)).toEqual([
			preview.data.entryId,
		]);

		const stranger = await createTeamService(ctx.user.id, ctx.user.email, ctx.user.phoneNumber, {
			name: "Gone",
		});
		await db.teamMembers
			.unscope("default")
			.where({ teamId: stranger.id, userId: ctx.user.id })
			.delete();
		for (const [tool, args] of [
			["list_team_members", { teamId: stranger.id }],
			["list_journal_entries", { teamId: stranger.id }],
			["create_journal_entry", { content: "Not mine.", teamId: stranger.id }],
		] as const) {
			const refused = await call(client, tool, args);
			expect(refused.isError, tool).toBe(true);
			expect(refused.text, tool).toContain("not a member of that team");
		}
	});

	it("stops working the moment the person disconnects the app", async () => {
		const tokens = await connectApp();
		const client = await mcpClient(tokens.access_token);
		expect((await call(client, "whoami")).isError).toBe(false);
		await createRouterClient(userAppRouter, {
			context: requireContext(),
		}).connectedApps.disconnect({ clientId: tokens.clientId });
		const after = await listToolsRaw(tokens.access_token);
		expect(after.status).toBe(401);
		expect(after.headers.get("www-authenticate")).toContain('error="invalid_token"');
	});

	it("stops working the moment an operator disables the app", async () => {
		const tokens = await connectApp();
		expect((await listToolsRaw(tokens.access_token)).status).toBe(200);
		await db.oauthClients.where({ clientId: tokens.clientId }).update({ disabled: true });
		expect((await listToolsRaw(tokens.access_token)).status).toBe(401);
	});

	it("takes write away at once when the person narrows the app", async () => {
		const tokens = await connectApp();
		await createRouterClient(userAppRouter, {
			context: requireContext(),
		}).connectedApps.setScopes({
			clientId: tokens.clientId,
			scopes: ["read"],
		});
		const client = await mcpClient(tokens.access_token);
		const names = (await client.listTools()).tools.map((tool) => tool.name);
		expect(names).not.toContain("create_journal_entry");
	});

	it("lists the app on the profile with what it changed", async () => {
		const tokens = await connectApp();
		const client = await mcpClient(tokens.access_token);
		const preview = await call(client, "create_journal_entry", { content: "Listed." });
		await call(client, "create_journal_entry", {
			content: "Listed.",
			entryId: preview.data.entryId,
			confirmation: preview.data.confirmation,
		});
		const apps = await createRouterClient(userAppRouter, {
			context: requireContext(),
		}).connectedApps.list();
		expect(apps.find((app) => app.clientId === tokens.clientId)).toMatchObject({
			platform: "Claude",
			isKnownPlatform: true,
			scopes: ["read", "write"],
			actionsLast30Days: 1,
			recent: [expect.objectContaining({ what: "Added a journal entry" })],
		});
	});

	it("refuses an OAuth access token on the oRPC routes", async () => {
		const tokens = await connectApp();
		const routed = createRouterClient(userAppRouter, {
			context: {
				reqHeaders: new Headers({ authorization: `Bearer ${tokens.access_token}` }),
			},
		});
		await expect(routed.me.profile()).rejects.toThrow(
			"OAuth access tokens are accepted on /mcp only.",
		);
	});
});

/** A server on the main dispatcher, which stamps the client address (one trusted proxy). */
const startApp = async () => {
	const app = createServer((req, res) => {
		void mainRequestDispatcher(req, res);
	});
	await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
	return app;
};

const stopApp = async (app: Server) => {
	app.closeAllConnections();
	await new Promise<void>((resolve) => app.close(() => resolve()));
};

describe("Connected apps: the MCP host (MCP_PUBLIC_URL)", () => {
	it("serves the MCP on its own host only, and nothing else there", () => {
		const mcp = "mcp.example.test";
		const onMcp = (path: string) => userMcpRouteFor(mcp, path, mcp);
		const onApi = (path: string) => userMcpRouteFor("app.example.test", path, mcp);
		expect(onMcp("/mcp")).toBe("serve");
		expect(onMcp("/.well-known/oauth-protected-resource/mcp")).toBe("serve");
		expect(onMcp("/.well-known/oauth-authorization-server/api/auth")).toBe("serve");
		expect(onMcp("/")).toBe("serve");
		expect(userMcpRouteFor("MCP.Example.test", "/mcp", mcp)).toBe("serve");
		for (const path of [
			"/api/auth/get-session",
			"/api/user-app/journalEntries/getAll",
			"/health",
		]) {
			expect(onMcp(path), path).toBe("not_found");
		}
		expect(onApi("/mcp")).toBe("not_found");
		expect(onApi("/.well-known/oauth-protected-resource/mcp")).toBe("not_found");
		expect(onApi("/.well-known/oauth-authorization-server/api/auth")).toBe("serve");
		expect(onApi("/api/user-app/journalEntries/getAll")).toBe("pass");
		expect(onApi("/")).toBe("pass");
	});

	it("serves everything on the API host while no MCP host is set", () => {
		expect(userMcpRouteFor("localhost:3001", "/mcp", null)).toBe("serve");
		expect(
			userMcpRouteFor("localhost:3001", "/.well-known/oauth-protected-resource/mcp", null),
		).toBe("serve");
		expect(userMcpRouteFor("localhost:3001", "/", null)).toBe("pass");
		expect(userMcpRouteFor("localhost:3001", "/api/auth/ok", null)).toBe("pass");
	});

	it("names the MCP host in the resource and the challenge, and routes by Host", async () => {
		const before = env.MCP_PUBLIC_URL;
		env.MCP_PUBLIC_URL = "https://mcp.example.test";
		const app = await startApp();
		const port = (app.address() as AddressInfo).port;
		const get = (host: string, path: string, method = "GET") =>
			new Promise<{ status: number; body: string; challenge: string }>((resolve, reject) => {
				const req = httpRequest(
					{ host: "127.0.0.1", port, path, method, headers: { host } },
					(res) => {
						let body = "";
						res.on("data", (chunk) => {
							body += String(chunk);
						});
						res.on("end", () =>
							resolve({
								status: res.statusCode ?? 0,
								body,
								challenge: String(res.headers["www-authenticate"] ?? ""),
							}),
						);
					},
				);
				req.on("error", reject);
				req.end();
			});
		try {
			const resource = await get("mcp.example.test", "/.well-known/oauth-protected-resource/mcp");
			expect(resource.status).toBe(200);
			expect(JSON.parse(resource.body)).toMatchObject({
				resource: "https://mcp.example.test/mcp",
				authorization_servers: [`${API}/api/auth`],
			});
			const unauthorised = await get("mcp.example.test", "/mcp", "POST");
			expect(unauthorised.status).toBe(401);
			expect(unauthorised.challenge).toContain(
				'resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"',
			);
			expect((await get("mcp.example.test", "/api/auth/get-session")).status).toBe(404);
			expect((await get("mcp.example.test", "/health")).status).toBe(404);
			expect((await get("mcp.example.test", "/")).body).toContain("https://mcp.example.test/mcp");
			// The app host answers 404 for the MCP and its resource document…
			const apiHost = new URL(API).host;
			expect((await get(apiHost, "/mcp", "POST")).status).toBe(404);
			expect((await get(apiHost, "/.well-known/oauth-protected-resource/mcp")).status).toBe(404);
			expect((await get(apiHost, "/.well-known/oauth-protected-resource")).status).toBe(404);
			// …but keeps the issuer's metadata and everything else.
			expect((await get(apiHost, "/.well-known/oauth-authorization-server/api/auth")).status).toBe(
				200,
			);
			expect((await get(apiHost, "/health")).status).toBe(200);
		} finally {
			env.MCP_PUBLIC_URL = before;
			await stopApp(app);
		}
	});
});

describe("Connected apps: a client that is its own metadata document (CIMD)", () => {
	let documents: Server;
	let docBase: string;
	let app: Server;
	let appBase: string;
	const hits: string[] = [];
	const trustedProxiesBefore = env.TRUSTED_PROXY_COUNT;

	beforeAll(async () => {
		// One trusted proxy: the X-Forwarded-For each request sends is its client.
		env.TRUSTED_PROXY_COUNT = 1;
		// The whole-server budget is shared by every run against this Redis.
		await clearRateLimit("cimd:all");
		documents = createServer((req, res) => {
			hits.push(req.url ?? "");
			const url = `${docBase}${req.url ?? ""}`;
			const body =
				req.url === "/claude.json"
					? {
							client_id: url,
							client_name: "Claude",
							client_uri: "https://claude.ai",
							redirect_uris: [REDIRECT],
							token_endpoint_auth_method: "none",
							grant_types: ["authorization_code", "refresh_token"],
							response_types: ["code"],
						}
					: req.url === "/wrong-id.json"
						? {
								client_id: "https://evil.example/other.json",
								redirect_uris: [REDIRECT],
								token_endpoint_auth_method: "none",
							}
						: req.url === "/secret.json"
							? {
									client_id: url,
									redirect_uris: [REDIRECT],
									token_endpoint_auth_method: "private_key_jwt",
								}
							: req.url === "/plain-http.json"
								? {
										client_id: url,
										redirect_uris: ["http://evil.example/cb"],
										token_endpoint_auth_method: "none",
									}
								: null;
			if (!body) {
				res.writeHead(404);
				res.end();
				return;
			}
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify(body));
		});
		await new Promise<void>((resolve) => documents.listen(0, "127.0.0.1", resolve));
		docBase = `http://127.0.0.1:${(documents.address() as AddressInfo).port}`;
		app = await startApp();
		appBase = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		env.TRUSTED_PROXY_COUNT = trustedProxiesBefore;
		documents.closeAllConnections();
		await new Promise<void>((resolve) => documents.close(() => resolve()));
		await stopApp(app);
	});

	const authorizeWith = async (clientId: string, verifier: string, ip = freshIp()) => {
		const query = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: REDIRECT,
			scope: "read write offline_access",
			state: "cimd",
			code_challenge: createHash("sha256").update(verifier).digest("base64url"),
			code_challenge_method: "S256",
			resource: userMcpResourceUrl(),
		});
		return fetch(`${appBase}/api/auth/oauth2/authorize?${query}`, {
			headers: {
				cookie: requireContext().reqHeaders.get("cookie") ?? "",
				"x-forwarded-for": ip,
			},
			redirect: "manual",
		});
	};

	it("advertises it", async () => {
		const metadata = (await (
			await fetch(new URL("/.well-known/oauth-authorization-server/api/auth", base))
		).json()) as Record<string, unknown>;
		expect(metadata.client_id_metadata_document_supported).toBe(true);
		expect(metadata.issuer).toBe(`${API}/api/auth`);
	});

	it("fetches the document on the first authorize, keeps it as a public client, and the app signs in with PKCE", async () => {
		const clientId = `${docBase}/claude.json`;
		const verifier = randomBytes(32).toString("base64url");
		const authorize = await authorizeWith(clientId, verifier);
		expect(authorize.status).toBe(302);
		const consentUrl = new URL(authorize.headers.get("location") ?? "");
		expect(consentUrl.pathname).toBe("/oauth/consent");
		expect(consentUrl.searchParams.get("client_id")).toBe(clientId);

		const row = await db.oauthClients.where({ clientId }).take();
		expect(row).toMatchObject({
			public: true,
			requirePKCE: true,
			tokenEndpointAuthMethod: "none",
			name: "Claude",
			redirectUris: [REDIRECT],
		});
		expect(row.clientSecret).toBeNull();
		expect((row.metadata as { cimd?: { fetchedAt?: number } }).cimd?.fetchedAt).toBeTypeOf(
			"number",
		);

		const cookie = requireContext().reqHeaders.get("cookie") ?? "";
		const consent = await auth.handler(
			new Request(`${API}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie,
					origin: env.WEBAPP_URL,
				},
				body: JSON.stringify({
					accept: true,
					oauth_query: consentUrl.search.slice(1),
				}),
			}),
		);
		const code =
			new URL(((await consent.json()) as { url: string }).url).searchParams.get("code") ?? "";
		const token = await auth.handler(
			new Request(`${API}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					code,
					redirect_uri: REDIRECT,
					client_id: clientId,
					code_verifier: verifier,
					resource: userMcpResourceUrl(),
				}),
			}),
		);
		expect(token.status).toBe(200);
		const { access_token } = (await token.json()) as { access_token: string };
		const client = await mcpClient(access_token);
		expect((await call(client, "whoami")).isError).toBe(false);

		const apps = await createRouterClient(userAppRouter, {
			context: requireContext(),
		}).connectedApps.list();
		expect(apps.find((entry) => entry.clientId === clientId)).toMatchObject({
			platform: "Claude",
			isKnownPlatform: true,
		});

		// A second authorize does not fetch again: the row's fetch time stands.
		const fetchedAt = (row.metadata as { cimd: { fetchedAt: number } }).cimd.fetchedAt;
		expect((await authorizeWith(clientId, verifier)).status).toBe(302);
		const again = await db.oauthClients.where({ clientId }).take();
		expect((again.metadata as { cimd: { fetchedAt: number } }).cimd.fetchedAt).toBe(fetchedAt);
	});

	it("refuses a document that is not its own, that wants a secret, or whose redirect URI is plain http, and an id that is no document", async () => {
		for (const clientId of [
			`${docBase}/wrong-id.json`,
			`${docBase}/secret.json`,
			`${docBase}/missing.json`,
			`${docBase}/plain-http.json`,
		]) {
			const authorize = await authorizeWith(clientId, randomBytes(32).toString("base64url"));
			expect(authorize.status, clientId).toBe(302);
			expect(authorize.headers.get("location") ?? "", clientId).toContain("error=invalid_client");
			expect(await db.oauthClients.where({ clientId }).takeOptional()).toBeUndefined();
		}
		expect(
			(
				await authorizeWith("not-a-registered-client", randomBytes(32).toString("base64url"))
			).headers.get("location") ?? "",
		).toContain("error=invalid_client");
	});

	it("fetches at most a set number of new documents per caller an hour", async () => {
		const ip = freshIp();
		const run = randomBytes(4).toString("hex");
		const urls = Array.from(
			{ length: CIMD_FETCHES_PER_IP_PER_HOUR + 1 },
			(_, index) => `/budget-${run}-${index}.json`,
		);
		for (const path of urls) {
			await authorizeWith(`${docBase}${path}`, randomBytes(32).toString("base64url"), ip);
		}
		const fetched = hits.filter((hit) => hit.startsWith(`/budget-${run}-`));
		expect(fetched).toEqual(urls.slice(0, CIMD_FETCHES_PER_IP_PER_HOUR));
	});

	it("refuses a new document once the app limit is reached, without fetching it", async () => {
		await db.$query`
			INSERT INTO oauth_clients (id, client_id, redirect_uris)
			SELECT substr(md5(g::text), 1, 26), 'cap-' || g, ARRAY['https://cap.example/cb']
			FROM generate_series(1, ${MAX_OAUTH_CLIENTS}) g
		`;
		const clientId = `${docBase}/claude.json`;
		const before = hits.length;
		const authorize = await authorizeWith(clientId, randomBytes(32).toString("base64url"));
		expect(authorize.headers.get("location") ?? "").toContain("error=invalid_client");
		expect(hits.length).toBe(before);
		expect(await db.oauthClients.where({ clientId }).takeOptional()).toBeUndefined();
	});
});
