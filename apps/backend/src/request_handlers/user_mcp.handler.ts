import { IncomingMessage, ServerResponse } from "node:http";
import { env } from "@backend/configs/env.config";
import { auth } from "@backend/modules/auth/auth.config";
import { isFeatureEnabled } from "@backend/modules/system/services/feature_flags.service";
import { checkAndRecordRateLimit } from "@backend/modules/system/services/rate_limit.service";
import {
	APP_DISPLAY_NAME,
	CONNECTED_APPS_FLAG,
	dedicatedMcpHost,
	MCP_CALLS_PER_MINUTE,
	OAUTH_SCOPES,
	oauthIssuerUrl,
	USER_MCP_PATH,
	userMcpOrigin,
	userMcpResourceUrl,
} from "@backend/modules/user_mcp/oauth.user_mcp.config";
import {
	type PrincipalRefusal,
	principalFromBearer,
} from "@backend/modules/user_mcp/services/principal.user_mcp.service";
import { createUserMcpServer } from "@backend/modules/user_mcp/user_mcp.server";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import { logger } from "@backend/utils/logger.utils";
import { nodeRequestHeaders } from "@backend/utils/node_headers.utils";
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NodeHttpRequest, NodeHttpResponse } from "@orpc/standard-server-node";

/**
 * The application MCP (ADR-045): a person's own AI apps work
 * on their account here, signed in with OAuth 2.1 through Better Auth's OAuth
 * provider. This handler serves
 *
 * - `/.well-known/oauth-protected-resource[/mcp]` (RFC 9728), which tells an
 *   app where to sign in, and `/.well-known/oauth-authorization-server[/api/auth]`
 *   (RFC 8414), the provider's own metadata at the root where apps look for it;
 * - `/mcp`, the Streamable HTTP MCP endpoint (stateless: a server per
 *   request), behind the person's access token.
 *
 * With `MCP_PUBLIC_URL` set these live on that host only and it serves
 * nothing else; the API host answers 404 for them, except the authorization
 * server's metadata, which belongs to the issuer (the API's `/api/auth`) and
 * is served on both.
 *
 * Tokens are bearer only, never cookies, so these answer any origin (a
 * browser-based MCP client needs CORS); nothing here reads a session cookie.
 */
const isAuthServerMetadata = (path: string) =>
	path.startsWith("/.well-known/oauth-authorization-server");

const isMcpOwnPath = (path: string) =>
	path === USER_MCP_PATH || path.startsWith("/.well-known/oauth-protected-resource");

/**
 * What the main dispatcher does with a request, by its host and path:
 * `serve` it here, answer `not_found`, or `pass` it to the other handlers.
 */
export const userMcpRouteFor = (
	host: string | undefined,
	url: string | undefined,
	mcpHost: string | null = dedicatedMcpHost(),
): "serve" | "not_found" | "pass" => {
	const path = (url ?? "").split("?")[0] ?? "";
	if (!mcpHost) return isMcpOwnPath(path) || isAuthServerMetadata(path) ? "serve" : "pass";
	if (host?.toLowerCase() === mcpHost) {
		return path === "/" || isMcpOwnPath(path) || isAuthServerMetadata(path) ? "serve" : "not_found";
	}
	if (isAuthServerMetadata(path)) return "serve";
	return isMcpOwnPath(path) ? "not_found" : "pass";
};

const BAD_TOKENS_PER_MINUTE = 20;

const allowAnyOrigin = (res: NodeHttpResponse, methods: string): void => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", methods);
	res.setHeader(
		"Access-Control-Allow-Headers",
		"authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
	);
	res.setHeader("Access-Control-Expose-Headers", "www-authenticate, mcp-session-id");
	res.setHeader("Access-Control-Max-Age", "600");
};

const reply = (res: NodeHttpResponse, status: number, body: Record<string, unknown>): void => {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.setHeader("Cache-Control", "no-store");
	res.end(JSON.stringify(body));
};

const protectedResourceMetadata = () => ({
	resource: userMcpResourceUrl(),
	authorization_servers: [oauthIssuerUrl()],
	scopes_supported: [...OAUTH_SCOPES],
	bearer_methods_supported: ["header"],
	resource_name: APP_DISPLAY_NAME,
	resource_documentation: env.WEBAPP_URL,
});

const resourceMetadataUrl = (): string =>
	`${userMcpOrigin()}/.well-known/oauth-protected-resource${USER_MCP_PATH}`;

const REFUSAL_TEXT: Record<Exclude<PrincipalRefusal, "missing">, string> = {
	audience: "The access token is not for this server.",
	unknown: "The access token is not valid.",
	expired: "The access token has expired.",
	disconnected: "This app was disconnected from the account.",
	account: "This account cannot be used right now.",
};

const challenge = (refusal: PrincipalRefusal): string => {
	const parts = [
		`Bearer resource_metadata="${resourceMetadataUrl()}"`,
		`scope="${OAUTH_SCOPES.join(" ")}"`,
	];
	if (refusal !== "missing")
		parts.push(`error="invalid_token"`, `error_description="${REFUSAL_TEXT[refusal]}"`);
	return parts.join(", ");
};

const bearerOf = (req: NodeHttpRequest): string | null => {
	const header = req.headers.authorization;
	if (typeof header !== "string") return null;
	const [scheme, ...rest] = header.trim().split(/\s+/);
	return scheme?.toLowerCase() === "bearer" ? rest.join(" ") || null : null;
};

async function serveMetadata(
	req: NodeHttpRequest,
	res: NodeHttpResponse,
	path: string,
): Promise<void> {
	allowAnyOrigin(res, "GET, OPTIONS");
	if (req.method === "OPTIONS") {
		res.statusCode = 204;
		res.end();
		return;
	}
	if (path.startsWith("/.well-known/oauth-protected-resource")) {
		res.setHeader("Cache-Control", "public, max-age=3600");
		res.statusCode = 200;
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify(protectedResourceMetadata()));
		return;
	}
	const response = await oauthProviderAuthServerMetadata(auth)(
		new Request(`${env.VITE_API_URL}${path}`),
	);
	let body = await response.text();
	if (response.status === 200) {
		try {
			// Apps may bring their own identity as a metadata document.
			body = JSON.stringify({
				...JSON.parse(body),
				client_id_metadata_document_supported: true,
			});
		} catch {
			// Not JSON: passed on as it came.
		}
	}
	res.statusCode = response.status;
	res.setHeader("Content-Type", "application/json");
	res.setHeader("Cache-Control", "public, max-age=3600");
	res.end(body);
}

async function serveMcp(req: NodeHttpRequest, res: NodeHttpResponse): Promise<void> {
	allowAnyOrigin(res, "GET, POST, DELETE, OPTIONS");
	if (req.method === "OPTIONS") {
		res.statusCode = 204;
		res.end();
		return;
	}
	// The API listens on HTTP/1; the transport speaks to that request type only.
	if (!(req instanceof IncomingMessage) || !(res instanceof ServerResponse)) {
		reply(res, 505, { error: "HTTP/1.1 only" });
		return;
	}
	const headers = nodeRequestHeaders(req);
	const principal = await principalFromBearer(bearerOf(req), userMcpResourceUrl());
	if (typeof principal === "string") {
		// Fails open (the limiter's default): tokens are long random strings, so this
		// limit only dampens noise; it does not guard a guessable secret.
		const limit = await checkAndRecordRateLimit(
			`mcp:bad-token:ip:${getClientIpAddress(headers)}`,
			BAD_TOKENS_PER_MINUTE,
			60,
		);
		res.setHeader("WWW-Authenticate", challenge(principal));
		reply(res, limit.allowed ? 401 : 429, {
			error: limit.allowed ? "invalid_token" : "too_many_requests",
			error_description:
				principal === "missing"
					? `Sign in to ${APP_DISPLAY_NAME} to use this server.`
					: REFUSAL_TEXT[principal],
		});
		return;
	}
	if (principal.scopes.length === 0) {
		res.setHeader(
			"WWW-Authenticate",
			`Bearer error="insufficient_scope", scope="read", resource_metadata="${resourceMetadataUrl()}"`,
		);
		reply(res, 403, { error: "insufficient_scope" });
		return;
	}
	const limit = await checkAndRecordRateLimit(
		`mcp:user:${principal.user.id}`,
		MCP_CALLS_PER_MINUTE,
		60,
	);
	if (!limit.allowed) {
		res.setHeader("Retry-After", String(limit.retryAfterSeconds));
		reply(res, 429, {
			error: "too_many_requests",
			retryAfterSeconds: limit.retryAfterSeconds,
		});
		return;
	}

	// Body size: main.handler.ts refuses a declared Content-Length
	// over DEFAULT_BODY_LIMIT_BYTES (1 MiB) for /mcp before this handler runs.
	// The SDK's transport reads the body itself with no cap, so a body without
	// a declared length (chunked) is refused here.
	if (req.method === "POST" && !req.headers["content-length"]) {
		reply(res, 411, { error: "length_required" });
		return;
	}

	const server = createUserMcpServer(principal, headers);
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	res.on("close", () => {
		void transport.close();
		void server.close();
	});
	await server.connect(transport);
	await transport.handleRequest(req, res);
}

export async function handleUserMcpRequest(
	req: NodeHttpRequest,
	res: NodeHttpResponse,
): Promise<void> {
	const path = (req.url ?? "").split("?")[0] ?? "";
	try {
		if (path.startsWith("/.well-known/")) return await serveMetadata(req, res, path);
		// The MCP host's front door: what it is and the address to add.
		if (path === "/") {
			if ((req.headers.accept ?? "").includes("text/html")) {
				const web = new URL(env.WEBAPP_URL).origin;
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html; charset=utf-8");
				res.end(
					`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${APP_DISPLAY_NAME} for AI apps</title>` +
						`<link rel="icon" href="${web}/favicon.ico"><meta name="viewport" content="width=device-width, initial-scale=1"></head>` +
						`<body style="font-family:system-ui;margin:40px auto;max-width:36em;line-height:1.5"><h1>${APP_DISPLAY_NAME}</h1>` +
						`<p>The address to add in Claude, ChatGPT or another AI app: <code>${userMcpResourceUrl()}</code></p>` +
						`<p><a href="${env.WEBAPP_URL}">Open ${APP_DISPLAY_NAME}</a></p></body></html>`,
				);
				return;
			}
			reply(res, 200, {
				name: APP_DISPLAY_NAME,
				mcp: userMcpResourceUrl(),
				docs: env.WEBAPP_URL,
			});
			return;
		}
		if (!(await isFeatureEnabled(CONNECTED_APPS_FLAG, null, true))) {
			reply(res, 404, { error: "Connected apps are switched off." });
			return;
		}
		return await serveMcp(req, res);
	} catch (error) {
		logger.error({ err: error, path }, "application MCP request failed");
		if (!res.headersSent) reply(res, 500, { error: "Something went wrong." });
	}
}
