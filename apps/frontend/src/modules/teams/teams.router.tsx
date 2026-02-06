import { Route, Routes } from "react-router";
import { TeamSettingsPage } from "./pages/TeamSettings.page";

const TeamsRouter = () => {
    return (
        <Routes>
            <Route path="settings" element={<TeamSettingsPage />} />
        </Routes>
    );
};

export default TeamsRouter;
