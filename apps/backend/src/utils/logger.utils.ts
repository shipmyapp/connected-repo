import { isDev, isProd } from '@backend/configs/env.config';
import pino from 'pino';
import pretty from 'pino-pretty';

// Create pretty stream for development
export const logger = isDev
	? pino(
			pretty({
				colorize: true,
				translateTime: "HH:MM:ss",
				ignore: "pid,hostname",
				singleLine: true,
				messageFormat: "{msg} {if req.method}[{req.method} {req.url}]{end} {if rpc.method}[{rpc.method}]{end} {if res.status}→ {res.status}{end}",
			}),
		)
	: isProd
		? pino({
				level: "info",
			})
		: pino();

/*
Level 	Numeric Value	Purpose
trace	10	Highly detailed messages for tracing program execution flow.
debug	20	Diagnostic information useful for debugging purposes.
info	30	General informational messages about the application's operation or significant events.
warn	40	Indicates potential issues or unusual situations that are not critical errors but may require investigation.
error	50	For error conditions that prevent normal operation or signify a failure, but the application might continue running.
fatal	60	Critical errors where the application or a significant component becomes unusable or crashes.
*/