/**
 * The body of `/` and `/health`. Everywhere: `status` (the container
 * healthcheck greps `"status":"ok"`), `timestamp` and `redis`.
 * The service name, environment, active-request count and HTTP version only
 * in development: to anyone else they describe the deployment.
 */
export const healthBody = (
	health: { status: string; timestamp: string; activeRequests: number },
	extra: { redis?: string; httpVersion?: string },
	details: { development: boolean; service: string; environment: string },
): Record<string, unknown> => ({
	status: health.status,
	timestamp: health.timestamp,
	...(extra.redis ? { redis: extra.redis } : {}),
	...(details.development
		? {
				service: details.service,
				environment: details.environment,
				activeRequests: health.activeRequests,
				httpVersion: extra.httpVersion,
				message: "Server is running",
			}
		: {}),
});
