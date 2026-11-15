import { createHash } from "node:crypto";
import { env } from "@backend/configs/env.config";
import { CONNECTED_APP_SCOPE_ENUM } from "@connected-repo/zod-schemas/connected_app.zod";

/**
 * Connected apps (ADR-045): a person signs an AI app (Claude, ChatGPT,
 * Cursor and others) in to their own account with OAuth 2.1, and the app
 * works through the application MCP at `/mcp`. These are the provider's
 * fixed choices.
 *
 * - Authorization code with PKCE (S256) only; no client-credentials grant,
 *   because every token acts for one person.
 * - Dynamic client registration is open, as the MCP authorization spec
 *   expects (`request_handlers/oauth_registration.handler.ts`).
 * - Opaque access tokens, stored hashed and checked against the database on
 *   every call, so disconnecting an app takes effect on its next call. One
 *   hour each; refresh tokens rotate and last 30 days.
 * - Each token is for this server's MCP resource only (RFC 8707 `resource`).
 */

/** The product's name as AI apps and the consent screen show it. Rename with the app. */
export const APP_DISPLAY_NAME = "OneQ";
/** The MCP server's machine name in `initialize` (lowercase, no spaces). */
export const USER_MCP_SERVER_NAME = "oneq";

export const USER_MCP_PATH = "/mcp";

/** Global feature flag that switches connected apps off (default on). */
export const CONNECTED_APPS_FLAG = "connected_apps.enabled";

/** Calls per person per minute on `/mcp` (Redis bucket `mcp:user:<id>`). */
export const MCP_CALLS_PER_MINUTE = 120;

/**
 * Where connected apps reach us: the dedicated MCP host when
 * `MCP_PUBLIC_URL` is set, else the API's own origin.
 */
export const userMcpOrigin = (): string => new URL(env.MCP_PUBLIC_URL ?? env.VITE_API_URL).origin;

/** The dedicated MCP host (`mcp.example.com`), or null when the MCP shares the API host. */
export const dedicatedMcpHost = (): string | null =>
	env.MCP_PUBLIC_URL ? new URL(env.MCP_PUBLIC_URL).host.toLowerCase() : null;

/** The protected resource's identifier: the MCP endpoint's own URL, the address people add. */
export const userMcpResourceUrl = (): string => `${userMcpOrigin()}${USER_MCP_PATH}`;

/**
 * The audiences tokens are issued for (`validAudiences` of the provider) and
 * the only resources `principalFromBearer` accepts a token for. One list, so
 * the two cannot drift.
 */
export const userMcpAudiences = (): string[] => [userMcpResourceUrl(), `${userMcpResourceUrl()}/`];

/** Better Auth's base URL, the OAuth issuer. */
export const oauthIssuerUrl = (): string => `${env.VITE_API_URL.replace(/\/+$/, "")}/api/auth`;

/**
 * What a person can let an app do, chosen on the consent screen. `read` is
 * always granted with a connection; `write` is the person's choice.
 */
const CONNECTED_APP_SCOPES = CONNECTED_APP_SCOPE_ENUM;
export type ConnectedAppScope = (typeof CONNECTED_APP_SCOPES)[number];

/** `offline_access` keeps an app connected past the first hour (a refresh token). */
export const OAUTH_SCOPES = [...CONNECTED_APP_SCOPES, "offline_access"] as const;

export const isConnectedAppScope = (value: string): value is ConnectedAppScope =>
	(CONNECTED_APP_SCOPES as readonly string[]).includes(value);

/**
 * Token prefixes, so a leaked token is recognisable to secret scanners.
 * Changing them invalidates every token already issued.
 */
export const OAUTH_TOKEN_PREFIX = {
	opaqueAccessToken: "oneq_at_",
	refreshToken: "oneq_rt_",
	clientSecret: "oneq_cs_",
} as const;

export const ACCESS_TOKEN_SECONDS = 60 * 60;
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

/**
 * Tokens and authorization codes are stored as this hash (SHA-256,
 * base64url); the MCP endpoint hashes the presented token the same way to
 * find it.
 */
export const hashOAuthToken = (token: string): string =>
	createHash("sha256").update(token).digest("base64url");

/** Metadata-document fetches per client IP per hour, and in total per hour. */
export const CIMD_FETCHES_PER_IP_PER_HOUR = 20;
export const CIMD_FETCHES_PER_HOUR = 300;
/** Registrations in total per day (on top of 10 a minute per IP). */
export const REGISTRATIONS_PER_DAY = 500;
/**
 * Registered apps the table may hold. Past it, registration and new
 * metadata documents are refused until the daily cleanup removes apps
 * nobody connected (older than a week, no consent, no token).
 */
export const MAX_OAUTH_CLIENTS = 5000;
/** Apps nobody connected are removed after this many days. */
export const UNUSED_OAUTH_CLIENT_DAYS = 7;
