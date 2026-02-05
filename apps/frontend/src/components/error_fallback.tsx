import { useEffect } from "react";
import { useRouteError } from "react-router";

export const ErrorFallback = () => {
	return <div>Something went wrong!!!</div>;
};

export const CustomErrorBoundary = () => {
	const error = useRouteError() as Error;

  useEffect(() => {
    console.error(error);
  }, [error]);

	return <ErrorFallback />;
}