import { db } from "@backend/db/db";
import { auth } from "@backend/modules/auth/auth.config";
import { checkAndRecordRateLimit } from "@backend/modules/system/services/rate_limit.service";
import {
	MAX_OAUTH_CLIENTS,
	OAUTH_SCOPES,
	REGISTRATIONS_PER_DAY,
} from "@backend/modules/user_mcp/oauth.user_mcp.config";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import { logger } from "@backend/utils/logger.utils";
import { nodeRequestHeaders } from "@backend/utils/node_headers.utils";
import { isAcceptableRedirectUri } from "@connected-repo/zod-schemas/redirect_uri.utils";
import type { NodeHttpRequest, NodeHttpResponse } from "@orpc/standard-server-node";
import { APIError } from "better-auth/api";
import { z } from "zod";

/**
 * Dynamic client registration for connected apps (ADR-045, RFC 7591), in front
 * of Better Auth's `/oauth2/register`.
 *
 * AI apps register before anyone has signed in, and Claude asks for
 * `client_secret_post`; refused, it cannot connect at all (2026-11-09). The
 * MCP authorization spec expects open registration, and a secret adds nothing
 * a public client with PKCE lacks, so both kinds are accepted here and handed
 * to the provider's registration from the server. Over HTTP the provider's own
 * endpoint registers public clients only (`auth.config.ts`, `hooks.before`):
 * every app comes through here, with these limits.
 *
 * The request is reduced to the RFC 7591 metadata an app may choose, PKCE is
 * forced on, the grants are authorization code and refresh only, and the
 * scopes are ours. A person still signs in and consents before any token.
 */
const OAUTH_REGISTRATION_PATH = "/api/auth/oauth2/register";

const REGISTRATIONS_PER_MINUTE = 10;
const MAX_BODY_BYTES = 32 * 1024;

const urlZod = z.string().url().max(2048);

/** `isAcceptableRedirectUri`: https, or loopback http with a port; no fragment, no userinfo. */
const redirectUriZod = urlZod.refine(isAcceptableRedirectUri, {
	message:
		"must be https, or http://127.0.0.1, http://[::1] or http://localhost with a port; no fragment",
});

const registrationZod = z.object({
	redirect_uris: z.array(redirectUriZod).min(1).max(10),
	token_endpoint_auth_method: z
		.enum(["none", "client_secret_basic", "client_secret_post"])
		.optional(),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	scope: z.string().max(512).optional(),
	client_name: z.string().max(200).optional(),
	client_uri: urlZod.optional(),
	logo_uri: urlZod.optional(),
	contacts: z.array(z.string().min(1).max(320)).min(1).max(10).optional(),
	tos_uri: urlZod.optional(),
	policy_uri: urlZod.optional(),
	software_id: z.string().max(200).optional(),
	software_version: z.string().max(200).optional(),
});

const ALLOWED_GRANTS = new Set(["authorization_code", "refresh_token"]);

/** What goes to the provider's registration: app-chosen metadata, our grants, scopes and PKCE. */
interface RegistrationBody {
	redirect_uris: string[];
	token_endpoint_auth_method: "none" | "client_secret_basic" | "client_secret_post";
	grant_types: Array<"authorization_code" | "refresh_token">;
	response_types: ["code"];
	scope: string;
	client_name?: string;
	client_uri?: string;
	logo_uri?: string;
	contacts?: string[];
	tos_uri?: string;
	policy_uri?: string;
	software_id?: string;
	software_version?: string;
	require_pkce: true;
}

export const isOAuthRegistrationRequest = (url: string | undefined): boolean =>
	(url ?? "").split("?")[0] === OAUTH_REGISTRATION_PATH;

const reply = (res: NodeHttpResponse, status: number, body: Record<string, unknown>): void => {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.setHeader("Cache-Control", "no-store");
	res.setHeader("Pragma", "no-cache");
	res.end(JSON.stringify(body));
};

const refuse = (res: NodeHttpResponse, error: string, description: string, status = 400) =>
	reply(res, status, { error, error_description: description });

const readJson = async (req: NodeHttpRequest): Promise<unknown> => {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
		size += buffer.byteLength;
		if (size > MAX_BODY_BYTES) throw new Error("too_large");
		chunks.push(buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

/** The metadata an app may choose, reduced to what we allow; or why not. */
export const registrationBodyFor = (
	input: unknown,
): { ok: true; body: RegistrationBody } | { ok: false; error: string; description: string } => {
	const parsed = registrationZod.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: "invalid_client_metadata",
			description: parsed.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join("; "),
		};
	}
	const request = parsed.data;
	const grants = request.grant_types ?? ["authorization_code", "refresh_token"];
	if (
		!grants.includes("authorization_code") ||
		grants.some((grant) => !ALLOWED_GRANTS.has(grant))
	) {
		return {
			ok: false,
			error: "invalid_client_metadata",
			description: "Only the authorization_code and refresh_token grants are offered.",
		};
	}
	if (request.response_types?.some((type) => type !== "code")) {
		return {
			ok: false,
			error: "invalid_client_metadata",
			description: "Only the code response type is offered.",
		};
	}
	const requested = request.scope?.split(" ").filter(Boolean) ?? [...OAUTH_SCOPES];
	const unknown = requested.filter((scope) => !(OAUTH_SCOPES as readonly string[]).includes(scope));
	if (unknown.length > 0) {
		return {
			ok: false,
			error: "invalid_scope",
			description: `Unknown scopes: ${unknown.join(", ")}.`,
		};
	}
	return {
		ok: true,
		body: {
			redirect_uris: request.redirect_uris,
			token_endpoint_auth_method: request.token_endpoint_auth_method ?? "client_secret_basic",
			grant_types: grants.filter((grant): grant is "authorization_code" | "refresh_token" =>
				ALLOWED_GRANTS.has(grant),
			),
			response_types: ["code"],
			scope: requested.join(" "),
			client_name: request.client_name,
			client_uri: request.client_uri,
			logo_uri: request.logo_uri,
			contacts: request.contacts,
			tos_uri: request.tos_uri,
			policy_uri: request.policy_uri,
			software_id: request.software_id,
			software_version: request.software_version,
			require_pkce: true,
		},
	};
};

export async function handleOAuthRegistration(
	req: NodeHttpRequest,
	res: NodeHttpResponse,
): Promise<void> {
	// Browser-based MCP clients register too; there is no cookie here to protect.
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
	if (req.method === "OPTIONS") {
		res.statusCode = 204;
		res.end();
		return;
	}
	if (req.method !== "POST") {
		refuse(res, "invalid_request", "Register with POST.", 405);
		return;
	}

	const ip = getClientIpAddress(nodeRequestHeaders(req));
	const [byIp, overall] = await Promise.all([
		checkAndRecordRateLimit(`oauth-register:ip:${ip}`, REGISTRATIONS_PER_MINUTE, 60),
		checkAndRecordRateLimit("oauth-register:all", REGISTRATIONS_PER_DAY, 86_400),
	]);
	const limit = byIp.allowed ? overall : byIp;
	if (!limit.allowed) {
		res.setHeader("Retry-After", String(limit.retryAfterSeconds));
		refuse(res, "too_many_requests", "Too many registrations. Try again later.", 429);
		return;
	}

	let input: unknown;
	try {
		input = await readJson(req);
	} catch {
		refuse(res, "invalid_client_metadata", "The body must be JSON metadata (RFC 7591).");
		return;
	}
	const registration = registrationBodyFor(input);
	if (!registration.ok) {
		refuse(res, registration.error, registration.description);
		return;
	}
	if ((await db.oauthClients.count()) >= MAX_OAUTH_CLIENTS) {
		refuse(res, "temporarily_unavailable", "Registration is closed for now. Try again later.", 503);
		return;
	}

	try {
		const client = await auth.api.registerOAuthClient({
			body: registration.body,
		});
		// The provider requires PKCE of every registered client; the row says so too.
		await db.oauthClients.where({ clientId: client.client_id }).update({ requirePKCE: true });
		logger.info(
			{
				oauthRegistration: {
					clientId: client.client_id,
					name: registration.body.client_name,
					method: registration.body.token_endpoint_auth_method,
					redirectHosts: registration.body.redirect_uris.map((uri: string) => {
						try {
							return new URL(uri).host || new URL(uri).protocol;
						} catch {
							return "invalid";
						}
					}),
				},
			},
			"connected app registered",
		);
		reply(res, 201, { ...client });
	} catch (error) {
		if (error instanceof APIError) {
			const body = error.body as
				| { error?: string; error_description?: string; message?: string }
				| undefined;
			refuse(
				res,
				body?.error ?? "invalid_client_metadata",
				body?.error_description ?? body?.message ?? error.message,
				error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 400,
			);
			return;
		}
		throw error;
	}
}
