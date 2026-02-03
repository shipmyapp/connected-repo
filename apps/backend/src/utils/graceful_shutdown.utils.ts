import { perMinuteCronJobs } from "@backend/cron_jobs/services/per_minute_cron";
import { db } from "@backend/db/db";
import { tbus } from "@backend/events/tbus";
import { otelNodeSdk } from "@backend/otel.sdk";
import { logger } from "@backend/utils/logger.utils";
import { recordErrorOtel } from "@backend/utils/record-message.otel.utils";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

  /**
   * Wait for active requests to complete with timeout
   */
  const waitForActiveRequests = async (timeoutMs: number): Promise<void> => {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms

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
            "Timeout reached waiting for active requests"
          );
          resolve();
          return;
        }

        setTimeout(check, checkInterval);
      };

      check();
    });
  };

/**
 * Graceful shutdown configuration
 * - Default 30s for HTTP requests to complete
 * - Up to 300s (5 min) for long-running agent tasks (configurable via env)
 * - Ensures zero-downtime deployments with orchestrator parallelism (start-first, stop-later)
 */
const GRACEFUL_SHUTDOWN_TIMEOUT = Number.parseInt(
  process.env.GRACEFUL_SHUTDOWN_TIMEOUT || "30000",
  10
); // 30s default for HTTP
const AGENT_TASK_TIMEOUT = Number.parseInt(
  process.env.AGENT_TASK_TIMEOUT || "300000",
  10
); // 5 min default for agent tasks

/**
 * Track server state for health checks and graceful shutdown
 */
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

export const handleServerClose = (
  server: Server<typeof IncomingMessage, typeof ServerResponse>
) => {
  /**
   * Graceful shutdown handler
   * 1. Stop accepting new connections immediately (server.close())
   * 2. Stop cron jobs and pg-tbus event bus
   * 3. Wait for active HTTP requests to complete
   * 4. Wait for long-running agent tasks (with extended timeout)
   * 5. Close database connections
   * 6. Shutdown OpenTelemetry
   * 7. Force exit if timeout exceeded
   */
  const gracefulShutdown = async (signal: string) => {
    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
      logger.warn("Shutdown already in progress, ignoring signal");
      return;
    }
    isShuttingDown = true;

    logger.info(
      { signal, activeRequests, gracefulTimeout: GRACEFUL_SHUTDOWN_TIMEOUT },
      "Received shutdown signal, closing server gracefully..."
    );

    const shutdownStartTime = Date.now();

    try {
      // Step 1: Stop accepting new HTTP connections
      // This prevents the orchestrator from routing new traffic to this instance
      server.close(() => {
        logger.info("HTTP server closed - no longer accepting connections");
      });

      // Step 2: Stop background processes
      await Promise.resolve(perMinuteCronJobs.stop()).catch((error) => {
        logger.error("Error stopping cron jobs", error);
      });

      // Stop pg-tbus event bus - this allows in-flight tasks to complete
      // but stops processing new tasks
      await tbus
        .stop()
        .catch((error) => {
          logger.error("Error stopping pg-tbus event bus", error);
        });

      // Step 3: Wait for active HTTP requests to complete (with timeout)
      const httpTimeout = Math.min(GRACEFUL_SHUTDOWN_TIMEOUT, 30000);
      await waitForActiveRequests(httpTimeout);

      // Step 4: Wait for long-running agent tasks (extended timeout)
      // This handles AI agents, webhooks, and background processing tasks
      const agentTimeout = Math.min(AGENT_TASK_TIMEOUT, 300000);
      const remainingTime = agentTimeout - (Date.now() - shutdownStartTime);

      if (remainingTime > 0 && activeRequests > 0) {
        logger.info(
          { remainingTime, activeRequests },
          "Waiting for long-running agent tasks..."
        );
        await waitForActiveRequests(remainingTime);
      }

      // Step 5: Close all active connections forcefully if any remain
      if (activeRequests > 0) {
        logger.warn(
          { activeRequests },
          "Forcefully closing remaining connections after graceful period"
        );
        server.closeAllConnections();
      }

      // Step 6: Close database connections
      await db.$close().catch((error) => {
        logger.error("Error closing database connection", error);
      });

      // Step 7: Shutdown OpenTelemetry/Sentry SDK
      await otelNodeSdk.shutdown().catch((error) => {
        logger.error("Error shutting down OpenTelemetry SDK", error);
      });

      const shutdownDuration = Date.now() - shutdownStartTime;
      logger.info(
        { shutdownDuration, signal },
        "Server closed successfully - graceful shutdown complete"
      );
      process.exit(0);
    } catch (error) {
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

  /**
   * Force shutdown after extended timeout
   * This ensures the container exits even if something is stuck
   */
  const forceShutdown = () => {
    const forceTimeout = AGENT_TASK_TIMEOUT + 10000; // 10s buffer after agent timeout

    setTimeout(() => {
      logger.error(
        { activeRequests, uptime: process.uptime() },
        `Forcefully shutting down after ${forceTimeout}ms timeout - ${activeRequests} requests still active`
      );
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

  // Handle various termination signals
  // SIGTERM: Kubernetes/Docker stop signal (preferred for graceful shutdown)
  // SIGINT: Ctrl+C in terminal
  // SIGHUP: Terminal hangup (less common in containers)
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

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
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

  // Export for testing and monitoring
  return {
    isShuttingDown: () => isShuttingDown,
    getActiveRequests: () => activeRequests,
  };
};