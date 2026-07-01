import { env } from "@backend/configs/env.config";

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
	ssl: false,
};
