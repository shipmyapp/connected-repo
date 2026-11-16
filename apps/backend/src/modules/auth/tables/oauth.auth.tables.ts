import { BaseTable } from "@backend/db/base_table";
import { ulid } from "ulid";

/**
 * Better Auth's OAuth provider tables (ADR-045): the apps people connect to
 * their account (Claude, ChatGPT and others, registered dynamically), the
 * tokens those apps hold and what each person agreed to. Tokens are stored
 * hashed; dates are real `Date`s because the plugin compares them with
 * `new Date()`.
 *
 * The provider no longer reads `public` or `type`: a public client is one
 * whose `tokenEndpointAuthMethod` is `"none"`, and the client kind is
 * `applicationType`. A later release drops both columns.
 */
export class OAuthClientTable extends BaseTable {
	readonly table = "oauth_clients";

	columns = this.setColumns((t) => ({
		id: t
			.string(26)
			.default(() => ulid())
			.primaryKey(),
		clientId: t.text().unique(),
		clientSecret: t.text().nullable(),
		clientDiscoveryId: t.text().nullable(),
		disabled: t.boolean().default(false),
		skipConsent: t.boolean().nullable(),
		enableEndSession: t.boolean().nullable(),
		subjectType: t.text().nullable(),
		scopes: t.array(t.text()).nullable(),
		clientCredentialsScopes: t.array(t.text()).default([]).nullable(),
		userId: t
			.uuid()
			.foreignKey("users", "id", { onUpdate: "RESTRICT", onDelete: "CASCADE" })
			.nullable(),
		name: t.text().nullable(),
		uri: t.text().nullable(),
		icon: t.text().nullable(),
		contacts: t.array(t.text()).nullable(),
		tos: t.text().nullable(),
		policy: t.text().nullable(),
		softwareId: t.text().nullable(),
		softwareVersion: t.text().nullable(),
		softwareStatement: t.text().nullable(),
		redirectUris: t.array(t.text()),
		postLogoutRedirectUris: t.array(t.text()).nullable(),
		backchannelLogoutUri: t.text().nullable(),
		backchannelLogoutSessionRequired: t.boolean().nullable(),
		tokenEndpointAuthMethod: t.text().nullable(),
		applicationType: t.text().nullable(),
		jwks: t.text().nullable(),
		jwksUri: t.text().nullable(),
		grantTypes: t.array(t.text()).nullable(),
		responseTypes: t.array(t.text()).nullable(),
		public: t.boolean().nullable(),
		type: t.text().nullable(),
		requirePKCE: t.name("require_pkce").boolean().nullable(),
		dpopBoundAccessTokens: t.boolean().default(false).nullable(),
		referenceId: t.text().nullable(),
		metadata: t.json<Record<string, unknown>>().nullable(),
		createdAt: t.timestamp().asDate().default(t.sql`now()`).nullable(),
		updatedAt: t.timestamp().asDate().default(t.sql`now()`).nullable(),
	}));
}

export class OAuthRefreshTokenTable extends BaseTable {
	readonly table = "oauth_refresh_tokens";

	columns = this.setColumns(
		(t) => ({
			id: t
				.string(26)
				.default(() => ulid())
				.primaryKey(),
			token: t.text().unique(),
			clientId: t
				.text()
				.foreignKey("oauth_clients", "client_id", { onUpdate: "CASCADE", onDelete: "CASCADE" }),
			sessionId: t.text().nullable(),
			userId: t.uuid().foreignKey("users", "id", { onUpdate: "RESTRICT", onDelete: "CASCADE" }),
			referenceId: t.text().nullable(),
			authorizationCodeId: t.text().nullable(),
			resources: t.array(t.text()).nullable(),
			requestedUserInfoClaims: t.array(t.text()).nullable(),
			expiresAt: t.timestamp().asDate(),
			createdAt: t.timestamp().asDate().default(t.sql`now()`),
			revoked: t.timestamp().asDate().nullable(),
			rotatedAt: t.timestamp().asDate().nullable(),
			rotationReplayResponse: t.text().nullable(),
			rotationReplayExpiresAt: t.timestamp().asDate().nullable(),
			authTime: t.timestamp().asDate().nullable(),
			confirmation: t.json<Record<string, unknown>>().nullable(),
			scopes: t.array(t.text()),
		}),
		(t) => [
			t.index(["userId", "clientId"], { name: "oauth_refresh_tokens_user_client_idx" }),
			t.index(["authorizationCodeId"], { name: "oauth_refresh_tokens_authorization_code_idx" }),
		],
	);
}

export class OAuthAccessTokenTable extends BaseTable {
	readonly table = "oauth_access_tokens";

	columns = this.setColumns(
		(t) => ({
			id: t
				.string(26)
				.default(() => ulid())
				.primaryKey(),
			token: t.text().unique(),
			clientId: t
				.text()
				.foreignKey("oauth_clients", "client_id", { onUpdate: "CASCADE", onDelete: "CASCADE" }),
			sessionId: t.text().nullable(),
			userId: t
				.uuid()
				.foreignKey("users", "id", { onUpdate: "RESTRICT", onDelete: "CASCADE" })
				.nullable(),
			referenceId: t.text().nullable(),
			refreshId: t
				.string(26)
				.foreignKey("oauth_refresh_tokens", "id", { onUpdate: "RESTRICT", onDelete: "CASCADE" })
				.nullable(),
			authorizationCodeId: t.text().nullable(),
			resources: t.array(t.text()).nullable(),
			requestedUserInfoClaims: t.array(t.text()).nullable(),
			expiresAt: t.timestamp().asDate(),
			createdAt: t.timestamp().asDate().default(t.sql`now()`),
			revoked: t.timestamp().asDate().nullable(),
			confirmation: t.json<Record<string, unknown>>().nullable(),
			scopes: t.array(t.text()),
		}),
		(t) => [
			t.index(["userId", "clientId"], { name: "oauth_access_tokens_user_client_idx" }),
			t.index(["authorizationCodeId"], { name: "oauth_access_tokens_authorization_code_idx" }),
		],
	);
}

export class OAuthConsentTable extends BaseTable {
	readonly table = "oauth_consents";

	columns = this.setColumns(
		(t) => ({
			id: t
				.string(26)
				.default(() => ulid())
				.primaryKey(),
			clientId: t
				.text()
				.foreignKey("oauth_clients", "client_id", { onUpdate: "CASCADE", onDelete: "CASCADE" }),
			userId: t
				.uuid()
				.foreignKey("users", "id", { onUpdate: "RESTRICT", onDelete: "CASCADE" })
				.nullable(),
			referenceId: t.text().nullable(),
			resources: t.array(t.text()).nullable(),
			requestedUserInfoClaims: t.array(t.text()).nullable(),
			scopes: t.array(t.text()),
			createdAt: t.timestamp().asDate().default(t.sql`now()`),
			updatedAt: t.timestamp().asDate().default(t.sql`now()`),
		}),
		(t) => [t.unique(["userId", "clientId"], { name: "oauth_consents_user_client_key" })],
	);
}

/**
 * The protected resources tokens are issued for (RFC 8707). The provider
 * seeds them at boot from its `resources` option: the application MCP's URL.
 */
export class OAuthResourceTable extends BaseTable {
	readonly table = "oauth_resources";

	columns = this.setColumns((t) => ({
		id: t
			.string(26)
			.default(() => ulid())
			.primaryKey(),
		identifier: t.text().unique(),
		name: t.text(),
		accessTokenTtl: t.integer().nullable(),
		refreshTokenTtl: t.integer().nullable(),
		signingAlgorithm: t.text().nullable(),
		signingKeyId: t.text().nullable(),
		allowedScopes: t.array(t.text()).nullable(),
		customClaims: t.json<Record<string, unknown>>().nullable(),
		dpopBoundAccessTokensRequired: t.boolean().default(false).nullable(),
		disabled: t.boolean().default(false).nullable(),
		policyVersion: t.integer().default(1).nullable(),
		metadata: t.json<Record<string, unknown>>().nullable(),
		createdAt: t.timestamp().asDate().default(t.sql`now()`).nullable(),
		updatedAt: t.timestamp().asDate().default(t.sql`now()`).nullable(),
	}));
}

/** Which client may ask for which resource. */
export class OAuthClientResourceTable extends BaseTable {
	readonly table = "oauth_client_resources";

	columns = this.setColumns(
		(t) => ({
			id: t
				.string(26)
				.default(() => ulid())
				.primaryKey(),
			clientId: t
				.text()
				.foreignKey("oauth_clients", "client_id", { onUpdate: "CASCADE", onDelete: "CASCADE" }),
			resourceId: t
				.text()
				.foreignKey("oauth_resources", "identifier", { onUpdate: "CASCADE", onDelete: "CASCADE" }),
			metadata: t.json<Record<string, unknown>>().nullable(),
			createdAt: t.timestamp().asDate().default(t.sql`now()`).nullable(),
		}),
		(t) => [
			t.unique(["clientId", "resourceId"], { name: "oauth_client_resources_client_resource_key" }),
			t.index(["resourceId"], { name: "oauth_client_resources_resource_idx" }),
		],
	);
}

/**
 * Single-use client assertion ids (`private_key_jwt`). The id is the
 * provider's digest of the assertion, so a replay collides on the key.
 */
export class OAuthClientAssertionTable extends BaseTable {
	readonly table = "oauth_client_assertions";

	columns = this.setColumns((t) => ({
		id: t.text().primaryKey(),
		expiresAt: t.timestamp().asDate(),
	}));
}
