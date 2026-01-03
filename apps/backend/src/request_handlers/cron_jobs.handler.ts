import { env } from "@backend/configs/env.config";
import { cronJobsRouter } from "@backend/routers/cron_jobs/cron_jobs.router";
import { orpcErrorParser } from "@backend/utils/errorParser";
import { logger } from "@backend/utils/logger.utils";
import { trace } from '@opentelemetry/api';
import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { ORPCError, onError } from "@orpc/server";
import { CORSPlugin, RequestHeadersPlugin } from "@orpc/server/plugins";

export const cronJobsHandler = new OpenAPIHandler(cronJobsRouter, {
	plugins: [
		new CORSPlugin({
			origin: env.CRON_JOB_ALLOWED_ORIGIN,
			allowMethods: ['POST'],
			allowHeaders: ["Authorization", "content-type"],
			credentials: false, // No cookies/credentials needed for API key auth
		}),
		new LoggingHandlerPlugin({
			logger,
			logRequestResponse: false,
			logRequestAbort: true,
		}),
		new RequestHeadersPlugin(),
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
			logger.error(error, "Cron Jobs error");
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
});