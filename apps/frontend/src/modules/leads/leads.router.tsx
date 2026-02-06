import CreateLeadPage from "@frontend/modules/leads/pages/CreateLead.page";
import LeadsListPage from "@frontend/modules/leads/pages/LeadsList.page";
import LeadDetailPage from "@frontend/modules/leads/pages/LeadDetail.page";
import { Route, Routes } from "react-router";

const LeadsRouter = () => {
	return (
		<Routes>
			<Route path="/" element={<LeadsListPage />} />
			<Route path="/new" element={<CreateLeadPage />} />
			<Route path="/:id" element={<LeadDetailPage />} />
		</Routes>
	);
};

export default LeadsRouter;
