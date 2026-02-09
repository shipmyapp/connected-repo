import React from "react";
import { Route, Routes } from "react-router";
import TeamDetailsPage from "./pages/TeamDetails.page";
import TeamSettingsPage from "./pages/TeamSettings.page";

export const TeamsRouter = () => {
	return (
		<Routes>
			<Route path="/:teamId" element={<TeamDetailsPage />} />
			<Route path="/:teamId/settings" element={<TeamSettingsPage />} />
		</Routes>
	);
};

export default TeamsRouter;
