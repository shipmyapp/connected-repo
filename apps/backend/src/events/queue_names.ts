/**
 * The pg-tbus service name, fixed in code. pg-tbus matches a task to a bus
 * by this exact name and keeps the service's place in the event log under
 * it, so it must never follow a variable: when it came from
 * OTEL_SERVICE_NAME, renaming the service for tracing would strand every
 * queued task under the old name.
 * OTEL_SERVICE_NAME now only names traces and log lines.
 *
 * "connected-repo-backend" is the OTEL_SERVICE_NAME the template ships in
 * .env.example and .env.test. A deployment that ran under another name must
 * put that name here before deploying, or let its queue drain first.
 */
export const API_QUEUE = "connected-repo-backend";
