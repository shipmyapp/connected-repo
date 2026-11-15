import { db } from "@backend/db/db";
import type { ActiveSessionSelectAll } from "@backend/modules/auth/tables/session.auth.table";
import type { UserSelectAll } from "@connected-repo/zod-schemas/user.zod";
import {
	type ConnectedAppScope,
	hashOAuthToken,
	isConnectedAppScope,
	OAUTH_TOKEN_PREFIX,
	userMcpAudiences,
} from "../oauth.user_mcp.config";

/** Who a connected app's call acts for, and what it was allowed. */
export interface ConnectedAppPrincipal {
	user: UserSelectAll;
	/** Stands in for a browser session in the procedures' context; no row exists. */
	session: ActiveSessionSelectAll;
	clientId: string;
	scopes: ConnectedAppScope[];
}

/** Why a token was refused, for the `WWW-Authenticate` error description. */
export type PrincipalRefusal =
	| "missing"
	| "unknown"
	| "expired"
	| "disconnected"
	| "account"
	| "audience";

/** Postgres `time[]` comes back as HH:mm:ss; the user schema says HH:mm. */
const hhmm = (value: string): string => (value.length > 5 ? value.slice(0, 5) : value);

/**
 * Resolves a bearer token presented to the MCP resource `resource`
 * (ADR-045). The resource must be one tokens are issued for; the token must
 * carry our prefix, exist (looked up by its hash, so the database never
 * holds a usable token), be unexpired, belong to an app that is not
 * disabled and that the person has not disconnected (its consent still
 * exists), and act for an existing account.
 */
export async function principalFromBearer(
	presented: string | null,
	resource: string,
): Promise<ConnectedAppPrincipal | PrincipalRefusal> {
	// Tokens carry no audience (opaque, provider 1.5.0); the provider issues
	// them only for userMcpAudiences(). A resource outside that list is
	// another server's: never accept these tokens there.
	if (!userMcpAudiences().includes(resource)) return "audience";
	if (!presented?.startsWith(OAUTH_TOKEN_PREFIX.opaqueAccessToken))
		return presented ? "unknown" : "missing";
	const raw = presented.slice(OAUTH_TOKEN_PREFIX.opaqueAccessToken.length);
	const token = await db.oauthAccessTokens.where({ token: hashOAuthToken(raw) }).takeOptional();
	if (!token?.userId) return "unknown";
	if (token.expiresAt.getTime() <= Date.now()) return "expired";

	const [client, consent] = await Promise.all([
		db.oauthClients.where({ clientId: token.clientId }).takeOptional(),
		db.oauthConsents.where({ clientId: token.clientId, userId: token.userId }).takeOptional(),
	]);
	if (!client || client.disabled || !consent) return "disconnected";

	const row = await db.users.findOptional(token.userId);
	if (!row) return "account";
	const user: UserSelectAll = {
		id: row.id,
		name: row.name,
		email: row.email,
		emailVerified: row.emailVerified,
		phoneNumber: row.phoneNumber,
		phoneNumberVerified: row.phoneNumberVerified,
		image: row.image,
		timezone: row.timezone,
		themeSetting: row.themeSetting,
		journalReminderTimes: row.journalReminderTimes.map(hhmm),
		activeTeamAppId: row.activeTeamAppId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};

	// A token keeps only the scopes its consent still grants: narrowing an
	// app's access on the profile applies to the tokens it already holds.
	const scopes = token.scopes.filter(
		(scope): scope is ConnectedAppScope =>
			isConnectedAppScope(scope) && consent.scopes.includes(scope),
	);
	return {
		user,
		clientId: token.clientId,
		scopes,
		session: {
			id: `oauth:${token.id}`,
			token: "",
			userId: user.id,
			ipAddress: null,
			userAgent: null,
			browser: null,
			os: null,
			device: null,
			deviceFingerprint: null,
			deviceKey: null,
			markedInvalidAt: null,
			expiresAt: token.expiresAt.getTime(),
			createdAt: token.createdAt.getTime(),
			updatedAt: Date.now(),
		},
	};
}
