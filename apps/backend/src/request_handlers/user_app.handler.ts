import { allowedOrigins } from '@backend/configs/allowed_origins.config';
import { isDev, isProd, isStaging } from '@backend/configs/env.config';
import { userAppRouter } from '@backend/routers/user_app/user_app.router';
import { orpcErrorParser } from '@backend/utils/errorParser';
import { logger } from '@backend/utils/logger.utils';
import { trace } from '@opentelemetry/api';
import { LoggingHandlerPlugin } from '@orpc/experimental-pino';
import { ORPCError, onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import { CORSPlugin, RequestHeadersPlugin, SimpleCsrfProtectionHandlerPlugin, StrictGetMethodPlugin } from '@orpc/server/plugins';

export const userAppHandler = new RPCHandler(userAppRouter, {
  plugins: [
    // Request headers plugin for accessing headers in context
    new RequestHeadersPlugin(),
    // CORS configuration with credentials support
    new CORSPlugin({
      origin: [...allowedOrigins],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['content-type', 'authorization', 'x-csrf-token', 'sentry-trace', 'baggage'],
      credentials: true,
    }),
    // FIXME: Using rate-limit throws an error. Try later at the end.
    // Rate limiting at handler level
    // new RatelimitHandlerPlugin(),
    // Structured logging with Pino
    new LoggingHandlerPlugin({
      logger,
      logRequestResponse: isDev, // Only log in dev
      logRequestAbort: true,
    }),
    // CSRF protection (disabled in development for easier testing)
    ...(isProd || isStaging ? [new SimpleCsrfProtectionHandlerPlugin()] : []),
    // Strict GET method plugin (queries must use GET)
    new StrictGetMethodPlugin(),
  ],
  interceptors: [
    ({ request, next }) => {
      const span = trace.getActiveSpan()

      request.signal?.addEventListener('abort', () => {
        span?.addEvent('aborted', { reason: String(request.signal?.reason) })
      })

      return next()
    },
    // Server-side error logging
    onError((error) => {
      logger.error(error, 'Server error');
    }),
  ],
  clientInterceptors: [
    // Client-side error transformation
    onError((error) => {
      const parsed = orpcErrorParser(error as Error);
      throw new ORPCError(parsed.code, {
        status: parsed.httpStatus,
        message: parsed.userFriendlyMessage,
        data: parsed.details,
        cause: error,
      });
    }),
  ],
})