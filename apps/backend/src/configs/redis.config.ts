import { env } from "@backend/configs/env.config";
import { logger } from "@backend/utils/logger.utils";
import { Redis } from "ioredis";

/**
 * The process's one Redis connection (ioredis). Redis is a required service
 * but never the source of truth: it holds only the rate-limit buckets
 * (`modules/system/services/rate_limit.service.ts`) and the ended-session
 * marks (`modules/auth/services/revoked_sessions.auth.service.ts`), which may
 * be lost at any time without losing data.
 *
 * Opened on first use, not at import: scripts that import the procedure chain
 * (`yarn gen:openapi`, `yarn db …`) must not open a socket, or ioredis's
 * reconnect timer keeps them from exiting. `server.ts` opens it at boot.
 */
let client: Redis | null = null;

export const getRedis = (): Redis => {
	if (client) return client;

	const created = new Redis(env.REDIS_URL, {
		// RESP2, the wire protocol the rate-limit Lua script's replies were written for
		// (ioredis 6 speaks RESP3 unless told otherwise).
		protocol: 2,
		lazyConnect: true,
		// Fail fast: a command against a down Redis rejects at once instead of
		// queueing, so the caller's fail-open / fail-closed rule applies promptly.
		enableOfflineQueue: false,
		maxRetriesPerRequest: 1,
		connectTimeout: 2000,
		// A Redis that accepts the connection but hangs must not hold a request.
		commandTimeout: 500,
		// Keep reconnecting in the background with a capped backoff.
		retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
	});

	let loggedDown = false;
	created.on("error", (err) => {
		if (loggedDown) return;
		loggedDown = true;
		logger.warn({ err }, "Redis unavailable; rate limits let requests through until it is back");
	});
	created.on("ready", () => {
		loggedDown = false;
		logger.info("Redis connected");
	});
	created.connect().catch(() => {
		// Reported once through the error listener; reconnects continue.
	});

	client = created;
	return created;
};

/** Closes the connection (graceful shutdown, end of a test file). */
export const closeRedis = async (): Promise<void> => {
	const current = client;
	if (!current) return;
	client = null;
	await current.quit().catch(() => current.disconnect());
};
