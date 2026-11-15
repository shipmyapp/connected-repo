import { z } from "zod";

/**
 * Connected apps (ADR-045): AI apps (Claude, ChatGPT, Cursor and others) a
 * person signed in to their own account through OAuth, which work through
 * the application MCP at /mcp. What the profile and the consent screen show.
 */
export const CONNECTED_APP_SCOPE_ENUM = ["read", "write"] as const;
export const connectedAppScopeZod = z.enum(CONNECTED_APP_SCOPE_ENUM);
export type ConnectedAppScopeDto = z.infer<typeof connectedAppScopeZod>;

/** Who the app is, as far as we can tell: a known platform by where it signs in back to, else its own name. */
export const connectedAppIdentityZod = z.object({
	clientId: z.string(),
	/** "Claude", "ChatGPT"…, or the name the app gave itself. */
	platform: z.string(),
	/** True when the platform was recognised by its sign-in address, not just by the name it gave. */
	isKnownPlatform: z.boolean(),
	/** The name the app registered with, which it chose itself. */
	name: z.string().nullable(),
	/** Where the sign-in returns to: the one thing an app cannot fake. */
	host: z.string(),
	uri: z.string().nullable(),
});
export type ConnectedAppIdentity = z.infer<typeof connectedAppIdentityZod>;

export const connectedAppDescribeInputZod = z.object({
	clientId: z.string().min(1).max(2048),
	redirectUri: z.string().min(1).max(2048),
});

export const connectedAppZod = connectedAppIdentityZod.extend({
	scopes: z.array(connectedAppScopeZod),
	connectedAt: z.number(),
	/** The last time it was given a token (each hour while it is in use). */
	lastUsedAt: z.number().nullable(),
	/** Changes it made in the last 30 days. */
	actionsLast30Days: z.number().int().min(0),
	/** Its latest changes, newest first. */
	recent: z.array(
		z.object({
			id: z.string(),
			what: z.string(),
			at: z.number(),
			teamId: z.string().nullable(),
		}),
	),
});
export type ConnectedApp = z.infer<typeof connectedAppZod>;

export const connectedAppIdInputZod = z.object({ clientId: z.string().min(1).max(2048) });

export const connectedAppSetScopesInputZod = z.object({
	clientId: z.string().min(1).max(2048),
	/** Only ever narrower than what was granted; `read` stays. */
	scopes: z.array(connectedAppScopeZod).min(1),
});
