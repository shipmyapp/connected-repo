import { TopProgressBar } from "@frontend/components/layout/TopProgressBar";
import { PwaUpdatePrompt } from "@frontend/components/pwa/update_prompt.pwa";
import { Outlet } from "react-router";

export const RootLayout = () => {
	return (
		<>
			<TopProgressBar />
			<Outlet />
			<PwaUpdatePrompt />
		</>
	);
};
