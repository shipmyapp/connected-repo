import { ErrorScreen } from "@connected-repo/ui-mui/feedback/ErrorScreen";
import { describeRouteError } from "@connected-repo/ui-mui/utils/route_error";
import { useEffect } from "react";
import { useRouteError } from "react-router";

/**
 * Route-level error element: a real page for 404s and for thrown errors,
 * never a blank screen. Crashes (not router responses) are reported to
 * Sentry lazily, so the SDK is not pulled in by this file.
 */
export const CustomErrorBoundary = () => {
	const error = useRouteError();
	const { title, detail, isNotFound, isRouteResponse } = describeRouteError(error);

	useEffect(() => {
		if (error && !isRouteResponse) {
			void import("@sentry/react").then((Sentry) => {
				Sentry.captureException(error);
			});
		}
	}, [error, isRouteResponse]);

	return (
		<ErrorScreen
			title={title}
			detail={detail}
			actionLabel={isNotFound ? "Back to the dashboard" : "Try again from the start"}
			actionHref="/dashboard"
		/>
	);
};
