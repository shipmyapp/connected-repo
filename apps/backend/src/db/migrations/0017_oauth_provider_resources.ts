import { change } from "../db_script";

// Better Auth's OAuth provider keeps more about clients and tokens:
// - oauth_clients: the client kind (`application_type`), signing keys,
//   back-channel logout, sender-constrained tokens, machine scopes.
// - tokens: the resources a grant covers, the authorization code that
//   issued them (a replayed code revokes what it issued), refresh-token
//   rotation, and a `revoked` date on access tokens (a session that ends
//   revokes the tokens issued under it).
// - oauth_resources / oauth_client_resources: the protected resources tokens
//   are issued for (the application MCP), seeded by the provider at boot.
// - oauth_client_assertions: single-use client assertion ids.
// The provider no longer reads `public` or `type`; they stay in place until a
// later release drops them.
change(async (db) => {
	await db.changeTable("oauth_clients", (t) => ({
		clientDiscoveryId: t.add(t.text().nullable()),
		subjectType: t.add(t.text().nullable()),
		clientCredentialsScopes: t.add(t.array(t.text()).default([]).nullable()),
		backchannelLogoutUri: t.add(t.text().nullable()),
		backchannelLogoutSessionRequired: t.add(t.boolean().nullable()),
		applicationType: t.add(t.text().nullable()),
		jwks: t.add(t.text().nullable()),
		jwksUri: t.add(t.text().nullable()),
		dpopBoundAccessTokens: t.add(t.boolean().default(false).nullable()),
	}));

	await db.changeTable("oauth_refresh_tokens", (t) => ({
		authorizationCodeId: t.add(t.text().nullable()),
		resources: t.add(t.array(t.text()).nullable()),
		requestedUserInfoClaims: t.add(t.array(t.text()).nullable()),
		rotatedAt: t.add(t.timestamp().nullable()),
		rotationReplayResponse: t.add(t.text().nullable()),
		rotationReplayExpiresAt: t.add(t.timestamp().nullable()),
		confirmation: t.add(t.json().nullable()),
	}));

	await db.changeTable("oauth_access_tokens", (t) => ({
		authorizationCodeId: t.add(t.text().nullable()),
		resources: t.add(t.array(t.text()).nullable()),
		requestedUserInfoClaims: t.add(t.array(t.text()).nullable()),
		revoked: t.add(t.timestamp().nullable()),
		confirmation: t.add(t.json().nullable()),
	}));

	await db.changeTable("oauth_consents", (t) => ({
		resources: t.add(t.array(t.text()).nullable()),
		requestedUserInfoClaims: t.add(t.array(t.text()).nullable()),
	}));

	await db.createTable("oauth_resources", (t) => ({
		id: t.string(26).primaryKey(),
		identifier: t.text().unique(),
		name: t.text(),
		accessTokenTtl: t.integer().nullable(),
		refreshTokenTtl: t.integer().nullable(),
		signingAlgorithm: t.text().nullable(),
		signingKeyId: t.text().nullable(),
		allowedScopes: t.array(t.text()).nullable(),
		customClaims: t.json().nullable(),
		dpopBoundAccessTokensRequired: t.boolean().default(false).nullable(),
		disabled: t.boolean().default(false).nullable(),
		policyVersion: t.integer().default(1).nullable(),
		metadata: t.json().nullable(),
		createdAt: t.timestamp().default(t.sql`now()`).nullable(),
		updatedAt: t.timestamp().default(t.sql`now()`).nullable(),
	}));
});

// Its own change so `down` drops it before the table it references.
change(async (db) => {
	await db.createTable(
		"oauth_client_resources",
		(t) => ({
			id: t.string(26).primaryKey(),
			clientId: t.text().foreignKey("oauth_clients", "client_id", {
				onUpdate: "CASCADE",
				onDelete: "CASCADE",
			}),
			resourceId: t.text().foreignKey("oauth_resources", "identifier", {
				onUpdate: "CASCADE",
				onDelete: "CASCADE",
			}),
			metadata: t.json().nullable(),
			createdAt: t.timestamp().default(t.sql`now()`).nullable(),
		}),
		(t) => [
			t.unique(["clientId", "resourceId"], {
				name: "oauth_client_resources_client_resource_key",
			}),
			t.index(["resourceId"], { name: "oauth_client_resources_resource_idx" }),
		],
	);

	await db.createTable("oauth_client_assertions", (t) => ({
		id: t.text().primaryKey(),
		expiresAt: t.timestamp(),
	}));
});

// Its own change so `down` drops the indexes before the columns they are on.
change(async (db) => {
	await db.addIndex("oauth_refresh_tokens", ["authorizationCodeId"], {
		name: "oauth_refresh_tokens_authorization_code_idx",
	});
	await db.addIndex("oauth_access_tokens", ["authorizationCodeId"], {
		name: "oauth_access_tokens_authorization_code_idx",
	});
});

// Existing clients: the kind moves to `application_type`, a public client is
// one whose token endpoint method is `none`, and no client has machine
// scopes (the client-credentials grant is not offered). Rows are updated,
// never removed; nothing to undo.
change(async (db, up) => {
	if (!up) return;
	await db.adapter.query(`
		UPDATE oauth_clients SET application_type = type
			WHERE application_type IS NULL AND type IN ('web', 'native');
		UPDATE oauth_clients SET token_endpoint_auth_method = 'none'
			WHERE public IS TRUE AND token_endpoint_auth_method IS NULL;
		UPDATE oauth_clients SET client_credentials_scopes = '{}'
			WHERE client_credentials_scopes IS NULL;
	`);
});
