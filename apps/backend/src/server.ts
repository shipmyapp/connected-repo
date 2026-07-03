import "./otel.sdk";

import { spawn } from "node:child_process";
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
import { startReconcileFcmTokensCron } from "@backend/cron_jobs/reconcile_fcm_tokens.cron";
import { startReminderDispatchCron } from "@backend/cron_jobs/reminder_dispatch.cron";
import { startSilentSyncDispatchCron } from "@backend/cron_jobs/silent_sync_dispatch.cron";
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

/**
 * Fire-and-forget Novu workflow sync — publishes code-defined workflows
 * (apps/backend/src/novu/workflows/*) to the Novu control plane so newly-added
 * workflows are available immediately after deploy without a separate
 * post-deploy step. Runs 8 s after listen so Traefik has time to route the
 * new container to the public bridge URL Novu will call back on.
 *
 * Non-blocking by design — the server is healthy immediately and sync happens
 * in the background. A sync failure is logged but never crashes the server;
 * subsequent user signups would still miss until the next boot retry, so the
 * error is worth alerting on.
 *
 * Skipped when NOVU_API_URL is unset (dev/CI without a real Novu instance).
 */
function syncNovuWorkflowsInBackground(): void {
	if (!env.NOVU_SECRET_KEY || !env.NOVU_API_URL) return;
	if (process.argv.includes("--smoke-test")) return;

	const bridgeUrl = `${env.VITE_API_URL}/api/novu`;
	const apiUrl = env.NOVU_API_URL;
	setTimeout(() => {
		logger.info({ bridgeUrl, apiUrl }, "Starting Novu workflow sync");
		// Pass NOVU_SECRET_KEY via env, not argv, so it stays out of `ps` output.
		const child = spawn(
			"npx",
			[
				"-y",
				"novu@latest",
				"sync",
				"--bridge-url",
				bridgeUrl,
				"--api-url",
				apiUrl,
			],
			{
				env: { ...process.env, NOVU_SECRET_KEY: env.NOVU_SECRET_KEY },
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("close", (code) => {
			if (code === 0) {
				logger.info({ stdout }, "Novu workflow sync completed");
			} else {
				logger.error(
					{ code, stdout, stderr },
					"Novu workflow sync failed — new workflows will 422 until next boot retries",
				);
			}
		});
		child.on("error", (err) => {
			logger.error({ err }, "Novu workflow sync process error");
		});
	}, 8000);
}

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
	// Both crons feed Novu — the reminder cron ends in a triggerNotification()
	// no-op when NOVU_SECRET_KEY is unset, and the reconcile cron hits Novu's
	// API on every user. Without the key, both would just burn CPU on their
	// scans. Gate the whole boot on the key so unconfigured environments
	// (CI, first-time dev) stay quiet.
	if (env.NOVU_SECRET_KEY) {
		startReminderDispatchCron();
		startReconcileFcmTokensCron();
		syncNovuWorkflowsInBackground();
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
