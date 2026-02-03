import { env } from "@backend/configs/env.config";

const databaseURL = `postgres://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;

export const dbConfig = {
	databaseURL,
	connectRetry: true as const,
	generatorIgnore: {
		schemas: [ "tbus" ],
	},
	schema: env.DB_SCHEMA,
	ssl: false,
};
