/**
 * The Sentry release: `<service>@<commit or package version>`. Read by
 * Sentry.init (instrumentation.ts) and by the source-map upload in
 * vite.config.ts, which must agree or uploaded maps never match an event.
 */
export const sentryReleaseName = (
	serviceName: string | undefined,
	commit: string | undefined,
	packageVersion: string,
): string => `${serviceName || "frontend"}@${commit || packageVersion}`;
