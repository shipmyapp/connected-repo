export interface RouteErrorDescription {
	title: string;
	detail: string;
	/** A 404 from the router: there is nothing at this address. */
	isNotFound: boolean;
	/** A thrown `Response` / router error response (not a crash): not worth reporting. */
	isRouteResponse: boolean;
}

const isRouteErrorResponse = (
	error: unknown,
): error is { status: number; statusText: string; internal: boolean } =>
	typeof error === "object" &&
	error !== null &&
	"status" in error &&
	"statusText" in error &&
	"internal" in error;

/** What a route's error page says, for any value React Router hands `useRouteError()`. */
export const describeRouteError = (error: unknown): RouteErrorDescription => {
	if (isRouteErrorResponse(error)) {
		if (error.status === 404) {
			return {
				title: "Page not found",
				detail: "There is nothing at this address.",
				isNotFound: true,
				isRouteResponse: true,
			};
		}
		return {
			title: `Error ${error.status}`,
			detail: error.statusText,
			isNotFound: false,
			isRouteResponse: true,
		};
	}
	if (error instanceof Error) {
		return {
			title: "Something went wrong",
			detail: error.message,
			isNotFound: false,
			isRouteResponse: false,
		};
	}
	return { title: "Something went wrong", detail: "", isNotFound: false, isRouteResponse: false };
};
