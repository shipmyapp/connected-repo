import { getRedis } from "@backend/configs/redis.config";

/**
 * Health-check view of Redis; never throws. `commandTimeout` (redis.config.ts)
 * bounds the ping, and with the offline queue off a ping on a dropped
 * connection rejects at once.
 */
export const getRedisStatus = async (): Promise<"ok" | "down"> => {
	try {
		return (await getRedis().ping()) === "PONG" ? "ok" : "down";
	} catch {
		return "down";
	}
};

/**
 * Opens the connection if needed and resolves `true` once it is ready, or
 * `false` after `timeoutMs`. Used at boot (server.ts) so the first request
 * finds a ready connection, and by tests that need a live Redis.
 */
export const redisReady = (timeoutMs = 2000): Promise<boolean> => {
	const client = getRedis();
	if (client.status === "ready") return Promise.resolve(true);
	return new Promise((resolve) => {
		const onReady = () => {
			clearTimeout(timer);
			resolve(true);
		};
		const timer = setTimeout(() => {
			client.off("ready", onReady);
			resolve(false);
		}, timeoutMs);
		client.once("ready", onReady);
	});
};
