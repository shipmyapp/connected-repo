import { env } from "@backend/configs/env.config";
import { dbSsl } from "@backend/db/config.db";
import { API_QUEUE } from "@backend/events/queue_names";
import createTBus from "pg-tbus";

/** Named by a constant, never by OTEL_SERVICE_NAME (queue_names.ts). */
export const tbus = createTBus(API_QUEUE, {
	db: {
		host: env.DB_HOST,
		port: Number(env.DB_PORT),
		user: env.DB_USER,
		password: env.DB_PASSWORD,
		database: env.DB_NAME,
		ssl: dbSsl,
	},
	schema: "tbus",
	worker: {
		// Each worker slot holds a pg connection from this bus's pool. Tight
		// concurrency leaves more headroom for HTTP request handling.
		// Tune via PG_TBUS_CONCURRENCY (default 3).
		concurrency: env.PG_TBUS_CONCURRENCY,
		intervalInMs: 1000,
	},
});
