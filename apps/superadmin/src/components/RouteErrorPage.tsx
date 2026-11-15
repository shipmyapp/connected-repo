import { ErrorScreen } from "@connected-repo/ui-mui/feedback/ErrorScreen";
import { describeRouteError } from "@connected-repo/ui-mui/utils/route_error";
import { useRouteError } from "react-router";

/** The console's route error element: the shared page, pointing home. */
export const RouteErrorPage = () => {
	const { title, detail } = describeRouteError(useRouteError());
	return (
		<ErrorScreen title={title} detail={detail} actionLabel="Back to teams" actionHref="/teams" />
	);
};
