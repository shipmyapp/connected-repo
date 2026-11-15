import { change } from "../db_script";

// ADR-045: a person connects an AI app (Claude, ChatGPT and others) to their
// own account through OAuth 2.1, and the app works through the application
// MCP at `/mcp`. Better Auth's OAuth provider keeps its clients, tokens and
// consents in the four oauth_* tables; tokens are stored hashed.
// `connected_app_actions` records what each app changed.
change(async (db) => {
	await db.createTable("oauth_clients", (t) => ({
		id: t.string(26).primaryKey(),
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
		requirePkce: t.boolean().nullable(),
		referenceId: t.text().nullable(),
		metadata: t.json().nullable(),
		createdAt: t.timestamp().default(t.sql`now()`).nullable(),
		updatedAt: t.timestamp().default(t.sql`now()`).nullable(),
	}));

	await db.createTable(
		"oauth_refresh_tokens",
		(t) => ({
			id: t.string(26).primaryKey(),
			token: t.text().unique(),
			clientId: t.text().foreignKey("oauth_clients", "client_id", {
				onUpdate: "CASCADE",
				onDelete: "CASCADE",
			}),
			sessionId: t.text().nullable(),
			userId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			referenceId: t.text().nullable(),
			expiresAt: t.timestamp(),
			createdAt: t.timestamp().default(t.sql`now()`),
			revoked: t.timestamp().nullable(),
			authTime: t.timestamp().nullable(),
			scopes: t.array(t.text()),
		}),
		(t) => [
			t.index(["userId", "clientId"], {
				name: "oauth_refresh_tokens_user_client_idx",
			}),
		],
	);

	await db.createTable(
		"oauth_access_tokens",
		(t) => ({
			id: t.string(26).primaryKey(),
			token: t.text().unique(),
			clientId: t.text().foreignKey("oauth_clients", "client_id", {
				onUpdate: "CASCADE",
				onDelete: "CASCADE",
			}),
			sessionId: t.text().nullable(),
			userId: t
				.uuid()
				.foreignKey("users", "id", {
					onUpdate: "RESTRICT",
					onDelete: "CASCADE",
				})
				.nullable(),
			referenceId: t.text().nullable(),
			refreshId: t
				.string(26)
				.foreignKey("oauth_refresh_tokens", "id", {
					onUpdate: "RESTRICT",
					onDelete: "CASCADE",
				})
				.nullable(),
			expiresAt: t.timestamp(),
			createdAt: t.timestamp().default(t.sql`now()`),
			scopes: t.array(t.text()),
		}),
		(t) => [
			t.index(["userId", "clientId"], {
				name: "oauth_access_tokens_user_client_idx",
			}),
		],
	);

	await db.createTable(
		"oauth_consents",
		(t) => ({
			id: t.string(26).primaryKey(),
			clientId: t.text().foreignKey("oauth_clients", "client_id", {
				onUpdate: "CASCADE",
				onDelete: "CASCADE",
			}),
			userId: t
				.uuid()
				.foreignKey("users", "id", {
					onUpdate: "RESTRICT",
					onDelete: "CASCADE",
				})
				.nullable(),
			referenceId: t.text().nullable(),
			scopes: t.array(t.text()),
			createdAt: t.timestamp().default(t.sql`now()`),
			updatedAt: t.timestamp().default(t.sql`now()`),
		}),
		(t) => [
			t.unique(["userId", "clientId"], {
				name: "oauth_consents_user_client_key",
			}),
		],
	);

	// No foreign key to oauth_clients or teams_app: the record outlives both.
	await db.createTable(
		"connected_app_actions",
		(t) => ({
			id: t.string(26).primaryKey(),
			userId: t.uuid().foreignKey("users", "id", {
				onUpdate: "RESTRICT",
				onDelete: "CASCADE",
			}),
			clientId: t.text(),
			teamId: t.string(26).nullable(),
			tool: t.text(),
			what: t.text(),
			request: t.text().nullable(),
			entityTable: t.text().nullable(),
			entityId: t.text().nullable(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) => [
			t.index(["userId", "clientId", { column: "createdAt", order: "DESC" }], {
				name: "connected_app_actions_user_client_created_idx",
			}),
		],
	);
});
