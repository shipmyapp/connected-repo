import React from "react";
import { Route, Routes } from "react-router";
import TeamSettingsPage from "./pages/TeamSettings.page";

export const TeamsRouter = () => {
	return (
		<Routes>
			<Route path="/:teamId/settings" element={<TeamSettingsPage />} />
		</Routes>
	);
};

export default TeamsRouter;
