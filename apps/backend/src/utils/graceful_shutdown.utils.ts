import type { Server } from "node:http";
import { db } from "@backend/db/db";
import { getTbusStartPromise } from "@backend/events/events.utils";
import { tbus } from "@backend/events/tbus";
import { otelNodeSdk } from "@backend/otel.sdk";
import {
	captureBackendException,
	flushBackendErrorTracking,
} from "@backend/utils/backend-error-tracking.utils";
import { logger } from "@backend/utils/logger.utils";
import { recordErrorOtel } from "@backend/utils/record-message.otel.utils";

const waitForActiveRequests = async (timeoutMs: number): Promise<void> => {
	const startTime = Date.now();
	const checkInterval = 100;

	return new Promise((resolve) => {
		const check = () => {
			if (activeRequests === 0) {
				resolve();
				return;
			}

			const elapsed = Date.now() - startTime;
			if (elapsed >= timeoutMs) {
				logger.warn(
					{ activeRequests, elapsed, timeout: timeoutMs },
					"Timeout reached waiting for active requests",
				);
				resolve();
				return;
			}

			setTimeout(check, checkInterval);
		};

		check();
	});
};

const GRACEFUL_SHUTDOWN_TIMEOUT = Number.parseInt(
	process.env.GRACEFUL_SHUTDOWN_TIMEOUT || "30000",
	10,
);
const AGENT_TASK_TIMEOUT = Number.parseInt(
	process.env.AGENT_TASK_TIMEOUT || "300000",
	10,
);

let isShuttingDown = false;
let activeRequests = 0;

export const getServerHealth = () => ({
	status: isShuttingDown ? "shutting_down" : "ok",
	activeRequests,
	timestamp: new Date().toISOString(),
});

export const incrementActiveRequests = () => {
	activeRequests++;
};

export const decrementActiveRequests = () => {
	activeRequests = Math.max(0, activeRequests - 1);
};

export const handleServerClose = (server: Server) => {
	const gracefulShutdown = async (signal: string) => {
		if (isShuttingDown) {
			logger.warn("Shutdown already in progress, ignoring signal");
			return;
		}
		isShuttingDown = true;

		logger.info(
			{ signal, activeRequests, gracefulTimeout: GRACEFUL_SHUTDOWN_TIMEOUT },
			"Received shutdown signal, closing server gracefully...",
		);

		const shutdownStartTime = Date.now();

		try {
			server.close(() => {
				logger.info("HTTP server closed - no longer accepting connections");
			});

			// Wait for any in-flight startEventBus() to finish before stopping tbus
			// or closing the pool. pg-tbus's stop() returns even when start() is
			// still running migrate(); if we then $close() the pool, the still-
			// running migrate() blows up with "Cannot use a pool after end".
			const startPromise = getTbusStartPromise();
			if (startPromise) {
				await Promise.race([
					startPromise,
					new Promise<void>((resolve) => setTimeout(resolve, 5000)),
				]);
			}

			await tbus.stop().catch((error) => {
				logger.error({ err: error }, "Error stopping pg-tbus event bus");
			});

			const httpTimeout = Math.min(GRACEFUL_SHUTDOWN_TIMEOUT, 30000);
			await waitForActiveRequests(httpTimeout);

			const agentTimeout = Math.min(AGENT_TASK_TIMEOUT, 300000);
			const remainingTime = agentTimeout - (Date.now() - shutdownStartTime);

			if (remainingTime > 0 && activeRequests > 0) {
				logger.info(
					{ remainingTime, activeRequests },
					"Waiting for long-running agent tasks...",
				);
				await waitForActiveRequests(remainingTime);
			}

			if (activeRequests > 0) {
				logger.warn(
					{ activeRequests },
					"Forcefully closing remaining connections after graceful period",
				);
				server.closeAllConnections();
			}

			await db.$close().catch((error) => {
				logger.error({ err: error }, "Error closing database connection");
			});

			// Drain Sentry's buffer before OTel shuts down — otherwise the
			// last batch of in-flight errors is lost on every deploy.
			await flushBackendErrorTracking();
			await otelNodeSdk.shutdown().catch((error) => {
				logger.error("Error shutting down OpenTelemetry SDK", error);
			});

			const shutdownDuration = Date.now() - shutdownStartTime;
			logger.info(
				{ shutdownDuration, signal },
				"Server closed successfully - graceful shutdown complete",
			);
			process.exit(0);
		} catch (error) {
			captureBackendException(error, {
				tags: { handler: "graceful_shutdown", signal },
			});
			logger.error({ error, signal }, "Error during graceful shutdown");
			recordErrorOtel({
				spanName: "graceful_shutdown_error",
				error: error instanceof Error ? error : new Error(String(error)),
				level: "error",
				tags: { shutdown_signal: signal },
			});
			process.exit(1);
		}
	};

	const forceShutdown = () => {
		const forceTimeout = AGENT_TASK_TIMEOUT + 10000;

		setTimeout(() => {
			logger.error(
				{ activeRequests, uptime: process.uptime() },
				`Forcefully shutting down after ${forceTimeout}ms timeout - ${activeRequests} requests still active`,
			);
			captureBackendException(new Error("Graceful shutdown timeout exceeded"), {
				context: { activeRequests, uptime: process.uptime() },
				tags: { handler: "force_shutdown" },
			});
			recordErrorOtel({
				spanName: "force_shutdown",
				error: new Error("Graceful shutdown timeout exceeded"),
				level: "error",
				tags: {
					active_requests: String(activeRequests),
					uptime: String(process.uptime()),
				},
			});
			process.exit(1);
		}, forceTimeout);
	};

	process.on("SIGTERM", () => {
		logger.info("SIGTERM received - starting graceful shutdown");
		forceShutdown();
		gracefulShutdown("SIGTERM");
	});

	process.on("SIGINT", () => {
		logger.info("SIGINT received - starting graceful shutdown");
		forceShutdown();
		gracefulShutdown("SIGINT");
	});

	process.on("SIGHUP", () => {
		logger.info("SIGHUP received - starting graceful shutdown");
		forceShutdown();
		gracefulShutdown("SIGHUP");
	});

	process.on("uncaughtException", (error) => {
		captureBackendException(error, {
			tags: { handler: "uncaught_exception" },
		});
		recordErrorOtel({
			spanName: "uncaughtException",
			error,
			level: "error",
			tags: { error_type: "uncaught_exception" },
		});
		logger.error({ error }, "Uncaught exception");
		forceShutdown();
		gracefulShutdown("uncaughtException");
	});

	process.on("unhandledRejection", (reason, promise) => {
		captureBackendException(reason, {
			context: { promise: String(promise) },
			tags: { handler: "unhandled_rejection" },
		});
		recordErrorOtel({
			spanName: "unhandledRejection",
			error: reason instanceof Error ? reason : new Error(String(reason)),
			level: "error",
			tags: { error_type: "unhandled_rejection" },
		});
		logger.error({ reason, promise }, "Unhandled rejection");
		forceShutdown();
		gracefulShutdown("unhandledRejection");
	});

	return {
		isShuttingDown: () => isShuttingDown,
		getActiveRequests: () => activeRequests,
	};
};
