import { env, isDev, isTest } from "@backend/configs/env.config";
import * as Sentry from "@sentry/node";
import pino from "pino";
import pretty from "pino-pretty";

const prettyStream = () =>
	pretty({
		colorize: true,
		translateTime: "HH:MM:ss",
		ignore: "pid,hostname",
		singleLine: true,
		messageFormat:
			"{msg} {if req.method}[{req.method} {req.url}]{end} {if rpc.method}[{rpc.method}]{end} {if res.status}→ {res.status}{end}",
	});

const loggerOptions: pino.LoggerOptions = {
	level: env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
	base: {
		service: env.OTEL_SERVICE_NAME,
		environment: env.NODE_ENV,
	},
};

// Pretty single-line logs in dev by default. Set LOG_PRETTY=false to emit raw
// pino JSON — useful when piping logs into an aggregator locally.
const usePretty = isDev && process.env.LOG_PRETTY !== "false";

/**
 * Forward every pino log line to Sentry as a *breadcrumb* (not an event).
 * When an error fires later, Sentry replays the breadcrumb trail leading up
 * to it. Breadcrumbs don't create issues; they ride along with real errors.
 */
const PINO_LEVEL_TO_SENTRY: Record<number, Sentry.SeverityLevel> = {
	10: "debug",
	20: "debug",
	30: "info",
	40: "warning",
	50: "error",
	60: "fatal",
};

class SentryBreadcrumbStream {
	write(chunk: string): void {
		if (!Sentry.isInitialized()) return;
		try {
			const parsed = JSON.parse(chunk) as Record<string, unknown> & {
				msg?: unknown;
				level?: number;
				time?: number;
				hostname?: unknown;
				pid?: unknown;
			};
			const level = PINO_LEVEL_TO_SENTRY[parsed.level ?? 30] ?? "info";
			const { msg, time, level: _level, hostname, pid, ...rest } = parsed;
			Sentry.addBreadcrumb({
				category: "pino",
				message: typeof msg === "string" ? msg : "",
				level,
				data: rest,
				timestamp: typeof time === "number" ? time / 1000 : undefined,
			});
		} catch {
			// Pretty-stream output isn't JSON — that's fine, just skip.
		}
	}
}

const createLogger = () => {
	if (isTest) {
		return pino({
			...loggerOptions,
			level: env.IS_E2E_TEST ? "error" : "silent",
		});
	}

	return pino(
		loggerOptions,
		pino.multistream([
			{ stream: usePretty ? prettyStream() : process.stdout },
			// Cap at info — anything finer wastes Sentry's bounded breadcrumb buffer.
			{ stream: new SentryBreadcrumbStream(), level: "info" },
		]),
	);
};

export const logger = createLogger();
