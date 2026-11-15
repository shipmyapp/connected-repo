import "./otel.sdk";

import { createServer as createHttpServer, Server as HttpServer } from "node:http";
import { allowedOrigins } from "@backend/configs/allowed_origins.config";
import {
	deploymentEnvProblem,
	env,
	isDev,
	isProd,
	isStaging,
	isTest,
} from "@backend/configs/env.config";
import { startReconcileFcmTokensCron } from "@backend/cron_jobs/reconcile_fcm_tokens.cron";
import { startReminderDispatchCron } from "@backend/cron_jobs/reminder_dispatch.cron";
import { startSilentSyncDispatchCron } from "@backend/cron_jobs/silent_sync_dispatch.cron";
import { startEventBus } from "@backend/events/events.utils";
import { ensureNovuWorkflowsInBackground } from "@backend/novu/ensure_workflows";
import { captureBackendException } from "@backend/utils/backend-error-tracking.utils";
import { handleServerClose } from "@backend/utils/graceful_shutdown.utils";
import { logger } from "@backend/utils/logger.utils";
import { redisReady } from "@backend/utils/redis.utils";
import type { NodeHttpRequest, NodeHttpResponse } from "@orpc/standard-server-node";
import { mainRequestDispatcher } from "./request_handlers/main.handler";

logger.info({ isDev, isProd, isStaging, isTest }, "Environment:");
logger.info(allowedOrigins, "Allowed Origins:");
logger.info(env.ALLOWED_ORIGINS, "ALLOWED_ORIGINS env:");

try {
	// A deployment that copied the example secret would sign every session
	// with a public key. The smoke test (image build) runs the example on purpose.
	const envProblem = deploymentEnvProblem(env);
	if (envProblem && !process.argv.includes("--smoke-test")) {
		throw new Error(envProblem);
	}

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
		logger.info({ url: env.VITE_API_URL, host, port: env.PORT, secure: false }, "Server running");

		if (process.argv.includes("--smoke-test")) {
			logger.info("Smoke test passed, exiting...");
			process.exit(0);
		}
	});

	startEventBus();
	// Open the Redis connection now so the first request finds it ready.
	// Never awaited: a missing Redis must not stop the server from starting
	// (the limiter fails open and /health reports `redis: "down"`).
	void redisReady();
	// Both crons feed Novu — the reminder cron ends in a triggerNotification()
	// no-op when NOVU_SECRET_KEY is unset, and the reconcile cron hits Novu's
	// API on every user. Without the key, both would just burn CPU on their
	// scans. Gate the whole boot on the key so unconfigured environments
	// (CI, first-time dev) stay quiet.
	if (env.NOVU_SECRET_KEY) {
		startReminderDispatchCron();
		startReconcileFcmTokensCron();
		// Bring Novu's workflows and layouts in line with src/novu (newer side
		// wins; ensure_workflows.ts). Background: never blocks the listen.
		if (!process.argv.includes("--smoke-test")) ensureNovuWorkflowsInBackground();
	} else {
		logger.info("Novu not configured; reminder/reconcile crons skipped");
	}

	// Silent-sync push runs independently of Novu — it uses firebase-admin
	// directly. Gated on FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS
	// being set (see firebase_admin.config.ts); the cron self-noops otherwise.
	startSilentSyncDispatchCron();

	handleServerClose(server);
} catch (err) {
	captureBackendException(err, {
		tags: { handler: "server_startup" },
	});
	logger.error("Server failed to start");
	logger.error(err);
	process.exit(1);
}
