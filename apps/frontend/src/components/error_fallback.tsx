import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { useRouteError } from "react-router";

export const ErrorFallback = () => {
	return <div>Something went wrong!!!</div>;
};

export const CustomErrorBoundary = () => {
	const error = useRouteError() as Error;

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

	return <ErrorFallback />;
}