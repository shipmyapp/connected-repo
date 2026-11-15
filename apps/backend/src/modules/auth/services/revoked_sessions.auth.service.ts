import { getRedis } from "@backend/configs/redis.config";
import { logger } from "@backend/utils/logger.utils";

/**
 * How long an ended session's signed cookie copy can still be presented:
 * the cookie cache (`session.cookieCache.maxAge` in auth.config.ts).
 */
export const SESSION_COOKIE_CACHE_SECONDS = 5 * 60;

const keyFor = (sessionId: string) => `revoked-session:${sessionId}`;

/** Records that a session ended, for as long as its cookie copy lives. */
export const markSessionRevoked = async (sessionId: string): Promise<void> => {
	try {
		await getRedis().set(keyFor(sessionId), "1", "EX", SESSION_COOKIE_CACHE_SECONDS);
	} catch (err) {
		logger.warn({ err }, "Ended session not recorded; its cookie copy lapses within five minutes");
	}
};

/** True when the session ended elsewhere. Redis down: false (the cookie cache bounds it). */
export const isSessionRevoked = async (sessionId: string): Promise<boolean> => {
	try {
		return (await getRedis().exists(keyFor(sessionId))) === 1;
	} catch {
		return false;
	}
};
