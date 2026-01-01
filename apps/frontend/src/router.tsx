import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { CustomErrorBoundary } from "@frontend/components/error_fallback";
import { AppLayout } from "@frontend/components/layout/AppLayout";
import { authLoader } from "@frontend/utils/auth.loader";
import * as Sentry from "@sentry/react";
import { lazy } from "react";
import { createBrowserRouter, type RouteObject, redirect } from "react-router";

type NavbarFields = {
	nb_icon?: string;
};

type BaseRouterWithNavbar = RouteObject & NavbarFields;
type ReactRouterWithNavbar = BaseRouterWithNavbar & {
	children?: ReactRouterWithNavbar[];
};

// HydrateFallback component for initial app loading
const HydrateFallback = () => (
	<Box
		sx={{
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			minHeight: "100vh",
			bgcolor: "background.default",
		}}
	>
		<LoadingSpinner size={48} />
	</Box>
);

const routerObjectWithNavbar: ReactRouterWithNavbar[] = [
	{
		path: "/",
		errorElement: <CustomErrorBoundary />,
		hydrateFallbackElement: <HydrateFallback />,
		children: [
			{
				index: true,
				loader: () => redirect("/dashboard"),
			},
			{
				path: "auth/*",
				Component: lazy(() => import("@frontend/modules/auth/auth.router")),
			},
			// Authenticated routes with AppLayout
			{
				element: <AppLayout />,
				loader: authLoader,
				children: [
					{
						path: "dashboard",
						Component: lazy(() => import("@frontend/pages/Dashboard.page")),
					},
					{
						path: "journal-entries/*",
						Component: lazy(() => import("@frontend/modules/journal-entries/journal-entries.router")),
					},
					{
						path: "profile",
						Component: lazy(() => import("@frontend/pages/Dashboard.page")), // TODO: Create Profile page
					},
				],
			},
		],
	},
];

// Call this AFTER Sentry.init()
const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV7(
  createBrowserRouter,
);

export const router = sentryCreateBrowserRouter(routerObjectWithNavbar);
