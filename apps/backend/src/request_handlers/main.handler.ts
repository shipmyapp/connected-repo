import { betterAuthHandler } from '@backend/request_handlers/better_auth.handler';
import { cronJobsHandler } from '@backend/request_handlers/cron_jobs.handler';
import { openApiHandler } from '@backend/request_handlers/open_api.handler';
import { userAppHandler } from '@backend/request_handlers/user_app.handler';
import type { NodeHttpRequest, NodeHttpResponse } from '@orpc/standard-server-node';
import { decrementActiveRequests, getServerHealth, incrementActiveRequests } from '@backend/utils/graceful_shutdown.utils';
import { logger } from '@backend/utils/logger.utils';
import { trace } from '@opentelemetry/api';
import { env, isDev } from '@backend/configs/env.config';

/**
 * Main request dispatcher that orchestrates all handlers and pre-checks.
 */
export async function mainRequestDispatcher(
  req: NodeHttpRequest, 
  res: NodeHttpResponse
) {
  incrementActiveRequests();

  const requestUrl = req.url;
  const method = req.method?.toUpperCase();

  // 1. High-level Logging & Trace ID
  console.log(`[Request] ${method} ${requestUrl}`);

  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    const spanContext = currentSpan.spanContext();
    res.setHeader('x-trace-id', spanContext.traceId);
  }

  // 2. Health & Shutdown Check
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

    // 3. Auth Routes (/api/auth/*)
    if (requestUrl?.startsWith("/api/auth")) {
      return await betterAuthHandler.handle(req, res);
    }

    // 4. Root Path / Health Check
    if (requestUrl === '/' || requestUrl?.startsWith('/?')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: health.status,
        service: env.OTEL_SERVICE_NAME,
        environment: env.NODE_ENV,
        timestamp: health.timestamp,
        activeRequests: health.activeRequests,
        message: 'Server is running',
        httpVersion: req.httpVersion,
        secure: false,
      }));
      return;
    }

    // 6. OpenAPI Routes (/api/*)
    const openApiResult = await openApiHandler.handle(req, res, {
      context: {},
      prefix: '/api',
    });
    if (openApiResult.matched) return;

    // 7. Cron Jobs Routes (/cron/*)
    const cronResult = await cronJobsHandler.handle(req, res, {
      context: {},
      prefix: '/cron',
    });
    if (cronResult.matched) return;

    // 8. oRPC User App Routes (/user-app/*)
    const userAppResult = await userAppHandler.handle(req, res, {
      context: {},
      prefix: '/user-app',
    });

    if (!userAppResult.matched) {
      if (!res.writableEnded) {
        res.statusCode = 404;
        res.end('No procedure matched');
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err, url: requestUrl, method }, "Unhandled request error");
    console.error(`[CRITICAL] Unhandled Error at ${method} ${requestUrl}:`, err);

    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        error: 'Internal Server Error', 
        message: err.message,
        stack: isDev ? err.stack : undefined 
      }));
    }
  } finally {
    decrementActiveRequests();
  }
}