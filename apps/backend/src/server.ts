import './otel.sdk';
import { createServer as createHttpServer, Server as HttpServer } from 'node:http';
import { allowedOrigins } from '@backend/configs/allowed_origins.config';
import { env, isDev, isProd, isStaging, isTest } from '@backend/configs/env.config';
import { perMinuteCronJobs } from "@backend/cron_jobs/services/per_minute_cron";
import { startEventBus } from "@backend/events/events.utils";
import { handleServerClose } from '@backend/utils/graceful_shutdown.utils';
import { logger } from '@backend/utils/logger.utils';
import type { NodeHttpRequest, NodeHttpResponse } from '@orpc/standard-server-node';
import { mainRequestDispatcher } from './request_handlers/main.handler';

logger.info({ isDev, isProd, isStaging, isTest }, "Environment:");
logger.info(allowedOrigins, "Allowed Origins:");
logger.info(env.ALLOWED_ORIGINS, "ALLOWED_ORIGINS env:");

try {
  /**
   * Universal listener that routes requests to the Main Dispatcher.
   */
  const requestListener = (req: NodeHttpRequest, res: NodeHttpResponse) => {
    mainRequestDispatcher(req, res).catch((err) => {
      logger.error({ err }, "Critical dispatcher error");
    });
  };

  const server = createHttpServer(requestListener);

  // Configure server timeouts (managed by node:http)
  if (server instanceof HttpServer) {
    server.keepAliveTimeout = 5000;
    server.headersTimeout = 6000;
  }

  // Bind to port
  server.listen(
    env.PORT,
    (isProd || isStaging) ? '0.0.0.0' : '127.0.0.1',
    () => {
      if (process.send) {
        process.send("ready"); // Notify PM2/Coolify
      }
      logger.info({ url: env.VITE_API_URL, port: env.PORT, secure: false }, "Server running");
    }
  );

  // TODO: Move this to a separate worker process.
  // TODO: Setup otel/sentry to track cron-jobs properly.
  // Start the cron job and event-bus
  startEventBus().then(() => {
    perMinuteCronJobs.start();
  });

  handleServerClose(server)
} catch (err) {
  logger.error("Server failed to start");
  logger.error(err);
  process.exit(1);
}
