import type { IncomingMessage, ServerResponse } from "node:http";
import { auth } from "@backend/modules/auth/auth.config";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { handleBetterAuthCors } from "@backend/utils/cors.utils";
import { logger } from "@backend/utils/logger.utils";
import type {
	NodeHttpRequest,
	NodeHttpResponse,
} from "@orpc/standard-server-node";
import { toNodeHandler } from "better-auth/node";

export const betterAuthHandler = {
	handle: async (req: NodeHttpRequest, res: NodeHttpResponse) => {
		const handled = handleBetterAuthCors(req, res);
		if (handled) return;

		const authHandler = toNodeHandler(auth);

		const headersForIp = new Headers();
		for (const [key, value] of Object.entries(req.headers)) {
			if (value) {
				headersForIp.set(key, Array.isArray(value) ? value.join(", ") : value);
			}
		}

		try {
			return await authHandler(req as IncomingMessage, res as ServerResponse);
		} catch (err) {
			logger.error(
				{ err, url: req.url, method: req.method },
				"better-auth handler threw",
			);
			captureBackendException(err, {
				captureAll: true,
				context: { url: req.url, method: req.method },
				tags: { handler: "better_auth" },
			});
			if (!res.writableEnded) {
				res.statusCode = 500;
				res.end(
					JSON.stringify({
						error: "Internal Auth Error",
						message: err instanceof Error ? err.message : String(err),
					}),
				);
			}
		}
	},
};
