import { BaseTable } from "@backend/db/base_table";
import { ulid } from "ulid";

/**
 * Better Auth's OAuth provider tables (ADR-045): the apps people connect to
 * their account (Claude, ChatGPT and others, registered dynamically), the
 * tokens those apps hold and what each person agreed to. Tokens are stored
 * hashed; dates are real `Date`s because the plugin compares them with
 * `new Date()`.
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
		disabled: t.boolean().default(false),
		skipConsent: t.boolean().nullable(),
		enableEndSession: t.boolean().nullable(),
		scopes: t.array(t.text()).nullable(),
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
		tokenEndpointAuthMethod: t.text().nullable(),
		grantTypes: t.array(t.text()).nullable(),
		responseTypes: t.array(t.text()).nullable(),
		public: t.boolean().nullable(),
		type: t.text().nullable(),
		requirePKCE: t.name("require_pkce").boolean().nullable(),
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
			expiresAt: t.timestamp().asDate(),
			createdAt: t.timestamp().asDate().default(t.sql`now()`),
			revoked: t.timestamp().asDate().nullable(),
			authTime: t.timestamp().asDate().nullable(),
			scopes: t.array(t.text()),
		}),
		(t) => [t.index(["userId", "clientId"], { name: "oauth_refresh_tokens_user_client_idx" })],
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
			expiresAt: t.timestamp().asDate(),
			createdAt: t.timestamp().asDate().default(t.sql`now()`),
			scopes: t.array(t.text()),
		}),
		(t) => [t.index(["userId", "clientId"], { name: "oauth_access_tokens_user_client_idx" })],
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
			scopes: t.array(t.text()),
			createdAt: t.timestamp().asDate().default(t.sql`now()`),
			updatedAt: t.timestamp().asDate().default(t.sql`now()`),
		}),
		(t) => [t.unique(["userId", "clientId"], { name: "oauth_consents_user_client_key" })],
	);
}
