import { AdminLayout } from "@superadmin/components/AdminLayout";
import { RouteErrorPage } from "@superadmin/components/RouteErrorPage";
import AuditPage from "@superadmin/pages/Audit.page";
import DeniedPage from "@superadmin/pages/Denied.page";
import FeatureFlagsPage from "@superadmin/pages/FeatureFlags.page";
import LoginPage from "@superadmin/pages/Login.page";
import TeamDetailPage from "@superadmin/pages/TeamDetail.page";
import TeamsPage from "@superadmin/pages/Teams.page";
import UsersPage from "@superadmin/pages/Users.page";
import { adminLoader } from "@superadmin/utils/admin.loader";
import { createBrowserRouter, redirect } from "react-router";

export const router = createBrowserRouter([
	{ path: "/login", Component: LoginPage, errorElement: <RouteErrorPage /> },
	{ path: "/denied", Component: DeniedPage, errorElement: <RouteErrorPage /> },
	{
		path: "/",
		Component: AdminLayout,
		loader: adminLoader,
		errorElement: <RouteErrorPage />,
		children: [
			{ index: true, loader: () => redirect("/teams") },
			{ path: "teams", Component: TeamsPage },
			{ path: "teams/:teamId", Component: TeamDetailPage },
			{ path: "users", Component: UsersPage },
			{ path: "flags", Component: FeatureFlagsPage },
			{ path: "audit", Component: AuditPage },
			{ path: "*", loader: () => redirect("/teams") },
		],
	},
]);
