import './otel.sdk';

import { createServer } from 'node:http';
import { allowedOrigins } from '@backend/configs/allowed_origins.config';
import { env, isDev, isProd, isStaging, isTest } from '@backend/configs/env.config';
import { perMinuteCronJobs } from "@backend/cron_jobs/services/per_minute_cron";
import { startEventBus } from "@backend/events/events.utils";
import { betterAuthHandler } from '@backend/request_handlers/better_auth.handler';
import { cronJobsHandler } from '@backend/request_handlers/cron_jobs.handler';
import { openApiHandler } from '@backend/request_handlers/open_api.handler';
import { userAppHandler } from '@backend/request_handlers/user_app.handler';
import { decrementActiveRequests, getServerHealth, handleServerClose, incrementActiveRequests } from '@backend/utils/graceful_shutdown.utils';
import { logger } from '@backend/utils/logger.utils';
import { recordErrorOtel } from "@backend/utils/record-message.otel.utils";
import { trace } from '@opentelemetry/api';

logger.info({ isDev, isProd, isStaging, isTest }, "Environment:");
logger.info(allowedOrigins, "Allowed Origins:");
logger.info(env.ALLOWED_ORIGINS, "ALLOWED_ORIGINS env:");

try {
  const server = createServer(async (req, res) => {
     // Track active requests for graceful shutdown
     incrementActiveRequests();

     // Get current span and add trace ID to response headers
     const currentSpan = trace.getActiveSpan();
     if (currentSpan) {
       const spanContext = currentSpan.spanContext();
       res.setHeader('x-trace-id', spanContext.traceId);
     }

     // Check if server is shutting down - return 503 for new requests
     // This helps orchestrators route traffic away from this instance faster
     const health = getServerHealth();
     if (health.status === 'shutting_down') {
       res.statusCode = 503;
       res.setHeader('Content-Type', 'application/json');
       res.setHeader('Connection', 'close');
       res.end(JSON.stringify({
         status: 'unavailable',
         message: 'Server is shutting down',
         timestamp: health.timestamp,
       }));
       decrementActiveRequests();
       return;
     }

     try {
       // Handle better-auth routes first (/api/auth/*)
       if (req.url?.startsWith("/api/auth")) {
         return await betterAuthHandler.handle(req, res);
         // TODO: There is a better way of doing this. Needs research.
         // return auth.handler(req);
       }

       // Handle root path requests - enhanced health check
       if (req.url === '/' || req.url?.startsWith('/?')) {
         const url = new URL(req.url, `http://${req.headers.host}`);
         const errorParam = url.searchParams.get('error');

        // If there's an error parameter, it's an OAuth error redirect that shouldn't be here
        if (errorParam) {
          const errorMessage = `OAuth error redirected to backend: ${decodeURIComponent(errorParam)}`;
          const oauthError = new Error(errorMessage);

          logger.error({ error: errorParam, url: req.url }, errorMessage);

          // Record error using common utility
          recordErrorOtel({
            spanName: 'oauth.error.redirect',
            error: oauthError,
            level: 'error',
            tags: {
              error_type: 'oauth_redirect_to_backend',
            },
            attributes: {
              'error.message': errorParam,
              'request.url': req.url || '',
              'request.method': req.method || '',
            },
          });

           // Redirect to frontend
           const redirectUrl = `${env.WEBAPP_URL}${url.search}?error=${encodeURIComponent(errorParam)}`;
           res.statusCode = 302;
           res.setHeader('Location', redirectUrl);
           res.end();
           return;
         }

         // Root path without errors - show basic health check
         res.statusCode = 200;
         res.setHeader('Content-Type', 'application/json');
         res.end(JSON.stringify({
           status: health.status,
           service: env.OTEL_SERVICE_NAME,
           environment: env.NODE_ENV,
           timestamp: health.timestamp,
           activeRequests: health.activeRequests,
           message: 'Server is running',
         }));
         return;
       }

       // Handle OpenAPI routes (/api/*)
       let result = await openApiHandler.handle(req, res, {
         context: {},
         prefix: '/api',
       });

       // Handle Cron Jobs routes (/cron/*)
       result = await cronJobsHandler.handle(req, res, {
         context: {},
         prefix: '/cron',
       });

         // Handle oRPC routes
       result = await userAppHandler.handle(req, res, {
         context: {},
         prefix: '/user-app',
       })

       if (!result.matched) {
         res.statusCode = 404
         res.end('No procedure matched')
       }
     } finally {
       // Always decrement active request count
       decrementActiveRequests();
     }
   })

  // Configure server to close idle connections
  server.keepAliveTimeout = 5000; // 5 seconds
  server.headersTimeout = 6000; // 6 seconds (must be higher than keepAliveTimeout)

  server.listen(
    env.PORT,
    (isProd || isStaging) ? '0.0.0.0' : '127.0.0.1',
    () => {
      if (process.send) {
        process.send("ready"); // ✅ Let PM2 know the app is ready
      }
      logger.info({ url: env.VITE_API_URL, port: env.PORT }, "Server running");
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
