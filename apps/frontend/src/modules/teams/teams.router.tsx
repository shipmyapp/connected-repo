import { lazy } from "react";
import { Route, Routes, Navigate } from "react-router";

const TeamSettingsPage = lazy(() => import("./pages/TeamSettings.page"));

export default function TeamsRouter() {
	return (
		<Routes>
			<Route path=":teamId/settings" element={<TeamSettingsPage />} />
			<Route path="*" element={<Navigate to="/dashboard" replace />} />
		</Routes>
	);
}
