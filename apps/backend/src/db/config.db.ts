import { env } from "@backend/configs/env.config";

/**
 * node-postgres TLS options from DB_SSL. Shared by the app pool, migrations
 * (db_script.ts uses dbConfig) and pg-tbus (events/tbus.ts) so every
 * connection to a managed database is encrypted alike.
 */
export const dbSsl =
	env.DB_SSL === "disable"
		? false
		: env.DB_SSL === "require"
			? { rejectUnauthorized: false }
			: {
					rejectUnauthorized: true,
					...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA.replace(/\\n/g, "\n") } : {}),
				};

const databaseURL = `postgres://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

export const dbConfig = {
	databaseURL,
	connectRetry: true as const,
	generatorIgnore: {
		schemas: ["tbus"],
	},
	// Uncomment when you actually need schema-scoped tables. Requires the schema
	// to exist in the DB (CREATE SCHEMA <name>) before migrations run.
	// schema: env.DB_SCHEMA,
	// pg pool size. node-postgres defaults to 10 which is too tight under
	// concurrent oRPC traffic on a shared cluster — see DB_POOL_SIZE in env.config.ts.
	max: env.DB_POOL_SIZE,
	// Keep connections warm (measured in production: most of an API
	// call's ~200 ms was pg.connect — node-postgres closes an idle connection
	// after 10 s, so a remote database paid a fresh TLS connect per query).
	// Idle connections live 5 minutes; up to 8 are kept even when idle (a
	// screen fires about a dozen queries at once); TCP keep-alive stops the
	// network from dropping them silently.
	idleTimeoutMillis: 5 * 60_000,
	min: Math.min(8, env.DB_POOL_SIZE),
	keepAlive: true,
	ssl: dbSsl,
};
