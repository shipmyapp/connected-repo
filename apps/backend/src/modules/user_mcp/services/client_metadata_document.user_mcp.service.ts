import { isIP } from "node:net";
import { isTest } from "@backend/configs/env.config";
import { db } from "@backend/db/db";
import { checkAndRecordRateLimit } from "@backend/modules/system/services/rate_limit.service";
import { getClientIpAddress } from "@backend/utils/client-info.utils";
import { logger } from "@backend/utils/logger.utils";
import { isAcceptableRedirectUri } from "@connected-repo/zod-schemas/redirect_uri.utils";
import { z } from "zod";
import {
	CIMD_FETCHES_PER_IP_PER_HOUR,
	CIMD_FETCHES_PER_HOUR as CIMD_FETCHES_TOTAL_PER_HOUR,
	MAX_OAUTH_CLIENTS,
	OAUTH_SCOPES,
} from "../oauth.user_mcp.config";
import { FetchRefusal, fetchRemoteFile } from "./fetch_remote.user_mcp.service";

/**
 * Client ID Metadata Documents (ADR-045; draft-ietf-oauth-client-id-metadata-
 * document, the registration the MCP authorization spec prefers since
 * 2025-11): an app's `client_id` is an HTTPS URL where it publishes its own
 * metadata, so nothing registers per person and the app's identity is the
 * document's host. Claude offers this as "Use Claude's published identity".
 *
 * Better Auth's provider does not fetch them here, but it finds a client by
 * `client_id` in our table, so when an authorize request names such a URL we fetch the
 * document, check it, and keep it as a public client under that very
 * `client_id`; the token exchange then finds it as any other. Documents are
 * fetched with the SSRF guard (never a private address),
 * kept for a day, and fetched again at most a few times an hour, so an
 * authorize request cannot make us fetch at will.
 */
const MAX_DOCUMENT_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const KEEP_FOR_MS = 24 * 60 * 60 * 1000;
/** A known document is not fetched again sooner than this for an unknown redirect. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
const FETCHES_PER_HOUR = 6;

/** Whether a `client_id` is a metadata document's URL rather than a registered id. */
const isClientIdMetadataUrl = (clientId: string): boolean => {
	let url: URL;
	try {
		url = new URL(clientId);
	} catch {
		return false;
	}
	if (url.protocol !== "https:" && !(isTest && url.protocol === "http:")) return false;
	if (url.username || url.password || url.hash || url.search) return false;
	// The draft requires a path, so an origin alone is never a client id.
	if (url.pathname === "" || url.pathname === "/") return false;
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (!isTest && (isIP(host) || host === "localhost" || !host.includes("."))) return false;
	return true;
};

const documentZod = z.object({
	client_id: z.string().min(1),
	client_name: z.string().max(200).optional(),
	client_uri: z.string().url().max(2048).optional(),
	logo_uri: z.string().url().max(2048).optional(),
	redirect_uris: z.array(z.string().url().max(2048)).min(1).max(20),
	token_endpoint_auth_method: z.string().optional(),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	scope: z.string().max(512).optional(),
	contacts: z.array(z.string().max(320)).max(10).optional(),
	tos_uri: z.string().url().max(2048).optional(),
	policy_uri: z.string().url().max(2048).optional(),
	software_id: z.string().max(200).optional(),
	software_version: z.string().max(200).optional(),
});

class DocumentRefusal extends Error {}

const fetchDocument = async (clientId: string) => {
	const fetched = await fetchRemoteFile(clientId, MAX_DOCUMENT_BYTES, {
		allowPrivate: isTest,
		accept: "application/json",
		timeoutMs: FETCH_TIMEOUT_MS,
	});
	let parsed: unknown;
	try {
		parsed = JSON.parse(fetched.bytes.toString("utf8"));
	} catch {
		throw new DocumentRefusal("The document is not JSON.");
	}
	const result = documentZod.safeParse(parsed);
	if (!result.success) {
		throw new DocumentRefusal(
			result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
		);
	}
	const doc = result.data;
	if (doc.client_id !== clientId) {
		throw new DocumentRefusal("The document's client_id is not its own URL.");
	}
	// No secret can stand behind a document fetched from anywhere: only a
	// public client (PKCE) is kept here.
	if (doc.token_endpoint_auth_method && doc.token_endpoint_auth_method !== "none") {
		throw new DocumentRefusal(
			`token_endpoint_auth_method ${doc.token_endpoint_auth_method} is not supported for a metadata document; use none.`,
		);
	}
	if (doc.grant_types && !doc.grant_types.includes("authorization_code")) {
		throw new DocumentRefusal("The document does not allow the authorization_code grant.");
	}
	// The same rule as registration (`isAcceptableRedirectUri`). This path
	// writes the URIs into oauth_clients itself, so the provider's own check
	// never sees them.
	if (doc.redirect_uris.some((uri) => !isAcceptableRedirectUri(uri))) {
		throw new DocumentRefusal(
			"Every redirect URI must be https, or loopback http with a port, with no fragment.",
		);
	}
	return doc;
};

type Outcome = "not_a_document" | "known" | "fetched" | "refused";

/**
 * Makes sure the client behind a metadata-document `client_id` is in the
 * table and current, fetching the document when it is new, stale, or does
 * not know the redirect URI asked for. Never throws: a refusal leaves the
 * table as it was and Better Auth answers the authorize request as for any
 * unknown client.
 */
async function ensureClientFromMetadataDocument(
	clientId: string,
	redirectUri: string | null,
	headers: Headers,
	now = Date.now(),
): Promise<Outcome> {
	if (!isClientIdMetadataUrl(clientId)) return "not_a_document";
	const row = await db.oauthClients.where({ clientId }).takeOptional();
	const cimd =
		row?.metadata && typeof row.metadata.cimd === "object"
			? (row.metadata.cimd as { fetchedAt?: unknown })
			: null;
	const fetchedAt = typeof cimd?.fetchedAt === "number" ? cimd.fetchedAt : 0;
	const knowsRedirect = !redirectUri || (row?.redirectUris.includes(redirectUri) ?? false);
	if (row && knowsRedirect && now - fetchedAt < KEEP_FOR_MS) return "known";
	if (row && !knowsRedirect && now - fetchedAt < RETRY_AFTER_MS) return "known";

	// Per document is not enough: every new URL is a new document. Bound the
	// caller and the whole server too.
	const ip = getClientIpAddress(headers);
	const [byIp, overall] = await Promise.all([
		checkAndRecordRateLimit(`cimd:ip:${ip}`, CIMD_FETCHES_PER_IP_PER_HOUR, 3600),
		checkAndRecordRateLimit("cimd:all", CIMD_FETCHES_TOTAL_PER_HOUR, 3600),
	]);
	if (!byIp.allowed || !overall.allowed) {
		logger.warn({ clientId }, "client metadata document: fetch budget spent, left as it was");
		return row ? "known" : "refused";
	}
	if (!row && (await db.oauthClients.count()) >= MAX_OAUTH_CLIENTS) {
		logger.warn({ clientId }, "client metadata document: app limit reached, refused");
		return "refused";
	}

	const limit = await checkAndRecordRateLimit(`cimd:${clientId}`, FETCHES_PER_HOUR, 3600);
	if (!limit.allowed) {
		logger.warn({ clientId }, "client metadata document: fetched too often, left as it was");
		return row ? "known" : "refused";
	}

	let doc: z.infer<typeof documentZod>;
	try {
		doc = await fetchDocument(clientId);
	} catch (error) {
		if (error instanceof DocumentRefusal || error instanceof FetchRefusal) {
			logger.warn({ clientId, reason: error.message }, "client metadata document refused");
			return row ? "known" : "refused";
		}
		throw error;
	}

	const fields = {
		name: doc.client_name ?? null,
		uri: doc.client_uri ?? null,
		icon: doc.logo_uri ?? null,
		contacts: doc.contacts ?? null,
		tos: doc.tos_uri ?? null,
		policy: doc.policy_uri ?? null,
		softwareId: doc.software_id ?? null,
		softwareVersion: doc.software_version ?? null,
		redirectUris: doc.redirect_uris,
		tokenEndpointAuthMethod: "none",
		grantTypes: ["authorization_code", "refresh_token"],
		responseTypes: ["code"],
		public: true,
		requirePKCE: true,
		disabled: false,
		scopes: [...OAUTH_SCOPES],
		metadata: { cimd: { fetchedAt: now, documentUrl: clientId } },
		updatedAt: new Date(now),
	};
	if (row) {
		await db.oauthClients.where({ clientId }).update(fields);
	} else {
		await db.oauthClients.create({
			clientId,
			clientSecret: null,
			createdAt: new Date(now),
			...fields,
		});
	}
	logger.info(
		{
			clientId,
			name: doc.client_name,
			redirectHosts: doc.redirect_uris.map((uri) => new URL(uri).host),
		},
		row ? "client metadata document refreshed" : "client metadata document registered",
	);
	return "fetched";
}

/**
 * For the main dispatcher: an authorize request whose `client_id` is a
 * metadata document gets its client fetched or refreshed before Better Auth
 * looks it up. Anything else passes straight through.
 */
export async function prepareAuthorizeClient(requestUrl: string, headers: Headers): Promise<void> {
	let url: URL;
	try {
		url = new URL(requestUrl, "http://localhost");
	} catch {
		return;
	}
	const clientId = url.searchParams.get("client_id");
	if (!clientId || !isClientIdMetadataUrl(clientId)) return;
	try {
		await ensureClientFromMetadataDocument(clientId, url.searchParams.get("redirect_uri"), headers);
	} catch (error) {
		logger.error({ err: error, clientId }, "client metadata document: unexpected failure");
	}
}
