import "./otel.sdk";

import {
	createServer as createHttpServer,
	Server as HttpServer,
} from "node:http";
import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import {
	env,
	isDev,
	isProd,
	isStaging,
	isTest,
} from "@backend/configs/env.config";
import { startEventBus } from "@backend/events/events.utils";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { handleServerClose } from "@backend/utils/graceful_shutdown.utils";
import { logger } from "@backend/utils/logger.utils";
import type {
	NodeHttpRequest,
	NodeHttpResponse,
} from "@orpc/standard-server-node";
import { mainRequestDispatcher } from "./request_handlers/main.handler";

logger.info({ isDev, isProd, isStaging, isTest }, "Environment:");
logger.info(allowedOrigins, "Allowed Origins:");
logger.info(env.ALLOWED_ORIGINS, "ALLOWED_ORIGINS env:");

try {
	const host = env.HOST ?? (isTest ? "127.0.0.1" : "0.0.0.0");

	const requestListener = (req: NodeHttpRequest, res: NodeHttpResponse) => {
		mainRequestDispatcher(req, res).catch((err) => {
			captureBackendException(err, {
				context: { url: req.url, method: req.method },
				tags: { handler: "request_listener" },
			});
			logger.error({ err }, "Critical dispatcher error");
		});
	};

	const server = createHttpServer(requestListener);

	if (server instanceof HttpServer) {
		server.keepAliveTimeout = 5000;
		server.headersTimeout = 6000;
	}

	server.listen(env.PORT, host, () => {
		if (process.send) {
			process.send("ready"); // Notify PM2/Coolify
		}
		logger.info(
			{ url: env.VITE_API_URL, host, port: env.PORT, secure: false },
			"Server running",
		);

		if (process.argv.includes("--smoke-test")) {
			logger.info("Smoke test passed, exiting...");
			process.exit(0);
		}
	});

	startEventBus();

	handleServerClose(server);
} catch (err) {
	captureBackendException(err, {
		tags: { handler: "server_startup" },
	});
	logger.error("Server failed to start");
	logger.error(err);
	process.exit(1);
}
