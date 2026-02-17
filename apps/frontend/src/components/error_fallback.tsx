import { useEffect } from "react";
import { useRouteError } from "react-router";

export const ErrorFallback = ({ error }: { error: Error }) => {
	return <div>{error.message}</div>;
};

export const CustomErrorBoundary = () => {
	const error = useRouteError() as Error;

  useEffect(() => {
		if (error) {
            // Lazily capture exception if Sentry is available
            import("@sentry/react").then((Sentry) => {
                Sentry.captureException(error);
            });
		}
	}, [error]);

	return <ErrorFallback error={error}/>;
}