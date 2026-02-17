import { env } from "@backend/configs/env.config";
import createTBus, { type Bus } from 'pg-tbus';

export const tbus = createTBus(env.OTEL_SERVICE_NAME, {
	db: {
		host: env.DB_HOST,
		port: Number(env.DB_PORT),
		user: env.DB_USER,
		password: env.DB_PASSWORD,
		database: env.DB_NAME,
	},
	schema: "tbus",
	worker: {
		concurrency: 5,
		intervalInMs: 1000,
	}
});

export type TBus = Bus;