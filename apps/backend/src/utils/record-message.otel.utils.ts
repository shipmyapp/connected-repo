import { SpanStatusCode, trace } from "@opentelemetry/api";

/**
 * Records an error with custom context in OpenTelemetry.
 *
 * Context-aware behavior:
 * - If called within an active trace (e.g., HTTP request), adds error as an event to the active span
 * - If called outside a trace (e.g., uncaughtException), creates a standalone span for the error
 *
 * @param options - Error recording options
 * @example
 * // Within an HTTP request (attached to request trace):
 * recordErrorOtel({
 *   spanName: 'oauth.callback.error',
 *   error: new Error('Invalid state'),
 *   level: 'warning',
 *   tags: { error_type: 'oauth_error' },
 *   attributes: {
 *     'oauth.provider': 'google',
 *     'error.message': 'Invalid state'
 *   }
 * });
 *
 * // Outside request context (creates standalone span):
 * process.on('uncaughtException', (error) => {
 *   recordErrorOtel({
 *     spanName: 'uncaughtException',
 *     error,
 *     level: 'error'
 *   });
 * });
 */
export function recordErrorOtel(options: {
	spanName: string;
	error: Error | string;
	level?: "error" | "warning" | "info";
	tags?: Record<string, string>;
	attributes?: Record<string, string>;
	tracerName?: string;
}) {
	const {
		spanName,
		error,
		level = "error",
		tags = {},
		attributes = {},
		tracerName = "app-errors",
	} = options;

	const tracer = trace.getTracer(tracerName);
	const activeSpan = trace.getActiveSpan();

	const errorMessage = error instanceof Error ? error.message : error;
	const spanAttributes = {
		...attributes,
		...tags,
		"error.level": level,
	};

	// If there's an active span, record the error as an event on it
	if (activeSpan) {
		activeSpan.setAttributes(spanAttributes);
		if (error instanceof Error) {
			activeSpan.recordException(error);
		} else {
			activeSpan.addEvent(spanName, {
				...spanAttributes,
				"error.message": errorMessage,
			});
		}
		return;
	}

	// Otherwise, create a standalone span for the error
	tracer.startActiveSpan(spanName, { attributes: spanAttributes }, (span) => {
		try {
			if (error instanceof Error) {
				span.recordException(error);
			} else {
				span.addEvent("error", { "error.message": errorMessage });
			}

			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: errorMessage,
			});
		} finally {
			span.end();
		}
	});
}

/**
 * Records a message in OpenTelemetry.
 *
 * Context-aware behavior:
 * - If called within an active span, adds an event to that span
 * - If called outside a span, creates a standalone span for the message
 *
 * @param options - Message recording options
 * @example
 * // Within an HTTP request (adds event to request span):
 * recordMessageOtel({
 *   spanName: 'oauth.error.redirect',
 *   message: 'OAuth error redirected to backend',
 *   level: 'warning',
 *   attributes: {
 *     'error.param': errorParam,
 *     'request.url': req.url
 *   }
 * });
 * @public
 */
export function recordMessageOtel(options: {
	spanName: string;
	message: string;
	level?: "error" | "warning" | "info";
	tags?: Record<string, string>;
	attributes?: Record<string, string>;
	tracerName?: string;
}) {
	const {
		spanName,
		message,
		level = "info",
		tags = {},
		attributes = {},
		tracerName = "app-messages",
	} = options;

	const tracer = trace.getTracer(tracerName);
	const activeSpan = trace.getActiveSpan();

	const eventAttributes = {
		...attributes,
		...tags,
		"message.level": level,
		"message.content": message,
	};

	// If there's an active span, add the message as an event to it
	if (activeSpan) {
		activeSpan.addEvent(spanName, eventAttributes);
		return;
	}

	// Otherwise, create a standalone span for the message
	tracer.startActiveSpan(spanName, { attributes: eventAttributes }, (span) => {
		try {
			span.addEvent(spanName, eventAttributes);

			if (level === "error" || level === "warning") {
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message,
				});
			} else {
				span.setStatus({
					code: SpanStatusCode.OK,
					message,
				});
			}
		} finally {
			span.end();
		}
	});
}
