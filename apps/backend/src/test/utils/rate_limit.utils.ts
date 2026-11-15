import { getRedis } from "@backend/configs/redis.config";

/**
 * Empties one rate-limit bucket (`rl:<key>`). For buckets shared by every run
 * against the same Redis (a whole-server total), so a test starts from a known
 * state. Waits for the connection: the client does not queue commands.
 */
export const clearRateLimit = async (key: string): Promise<void> => {
	const redis = getRedis();
	if (redis.status !== "ready") {
		await new Promise<void>((resolve) => redis.once("ready", () => resolve()));
	}
	await redis.del(`rl:${key}`);
};
