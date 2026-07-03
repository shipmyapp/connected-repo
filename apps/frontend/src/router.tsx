import { LoadingSpinner } from "@connected-repo/ui-mui/components/LoadingSpinner";
import { Box } from "@connected-repo/ui-mui/layout/Box";
import { CustomErrorBoundary } from "@frontend/components/error_fallback";
import { AppLayout } from "@frontend/components/layout/AppLayout";
import { RootLayout } from "@frontend/components/layout/RootLayout";
import { authLoader } from "@frontend/utils/auth.loader";
import * as Sentry from "@sentry/react";
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

// react-router `lazy` route property: the router awaits the chunk before
// swapping the page, so `useNavigation().state` is "loading" during the fetch
// (which drives the TopProgressBar) instead of React.lazy's blank-Suspense flash.
const lazyRoute = (importer: () => Promise<{ default: React.ComponentType }>) =>
	async () => {
		const mod = await importer();
		return { Component: mod.default };
	};

const routerObjectWithNavbar: ReactRouterWithNavbar[] = [
	{
		path: "/",
		Component: RootLayout,
		errorElement: <CustomErrorBoundary />,
		hydrateFallbackElement: <HydrateFallback />,
		children: [
			{
				index: true,
				loader: () => redirect("/dashboard"),
			},
			{
				path: "auth/*",
				lazy: lazyRoute(() => import("@frontend/modules/auth/auth.router")),
			},
			// Authenticated routes with AppLayout
			{
				element: <AppLayout />,
				loader: authLoader,
				children: [
					{
						path: "dashboard",
						lazy: lazyRoute(() => import("@frontend/pages/Dashboard.page")),
					},
					{
						path: "journal-entries/*",
						lazy: lazyRoute(() => import("@frontend/modules/journal-entries/journal-entries.router")),
					},
					{
						path: "teams/*",
						lazy: lazyRoute(() => import("@frontend/modules/teams/teams.router")),
					},
					{
						path: "profile",
						lazy: lazyRoute(() => import("@frontend/pages/Profile.page")),
					},
					{
						path: "settings/sync",
						lazy: lazyRoute(() => import("@frontend/pages/SettingsSync.page")),
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
