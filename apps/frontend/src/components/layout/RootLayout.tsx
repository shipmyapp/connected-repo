import { TopProgressBar } from "@frontend/components/layout/TopProgressBar";
import { PwaUpdatePrompt } from "@frontend/components/pwa/update_prompt.pwa";
import { useServiceWorkerNavigation } from "@frontend/hooks/use-service-worker-navigation";
import { Outlet } from "react-router";

export const RootLayout = () => {
	// A notification tap shows its screen in this window, through the router: no reload,
	// so the DataWorker and any pending writes carry on.
	useServiceWorkerNavigation();
	return (
		<>
			<TopProgressBar />
			<Outlet />
			<PwaUpdatePrompt />
		</>
	);
};
